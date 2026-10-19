import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AiProvider } from '@contexual/database';
import { ProvidersService } from '../providers/providers.service';

const MAX_AUDIO_BYTES = 8_000_000;
const MAX_SPEAK_CHARS = 4_000;
const OPENAI_AUDIO_URL = 'https://api.openai.com/v1/audio';

const AUDIO_TYPES = new Set([
  'audio/webm',
  'audio/wav',
  'audio/wave',
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/ogg',
  'audio/flac',
]);

export type SpeechAudioFile = {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname?: string;
};

@Injectable()
export class SpeechService {
  fetchImpl: typeof fetch = fetch;

  constructor(private readonly providers: ProvidersService) {}

  async transcribe(organizationId: string, file: SpeechAudioFile) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Record some audio before transcribing.');
    }
    if (file.size > MAX_AUDIO_BYTES) {
      throw new BadRequestException('Voice recordings must be 8 MB or smaller.');
    }

    const mime = file.mimetype.split(';')[0]?.trim().toLowerCase() ?? '';
    if (!AUDIO_TYPES.has(mime)) {
      throw new BadRequestException(
        'Voice input must be a WebM, WAV, MP3, M4A, or Ogg recording.',
      );
    }

    const apiKey = await this.requireOpenAiKey(organizationId);
    const form = new FormData();
    const audio = new Uint8Array(file.buffer.byteLength);
    audio.set(file.buffer);
    form.append(
      'file',
      new Blob([audio], { type: mime }),
      file.originalname || 'speech.webm',
    );
    form.append('model', 'whisper-1');
    form.append('response_format', 'json');

    const response = await this.request(
      `${OPENAI_AUDIO_URL}/transcriptions`,
      apiKey,
      form,
    );
    await this.assertOk(response);
    const body = (await response.json().catch(() => ({}))) as { text?: string };
    return { text: (body.text ?? '').trim() };
  }

  async synthesize(organizationId: string, text: string): Promise<Buffer> {
    const spoken = text.trim();
    if (!spoken) {
      throw new BadRequestException('There is no reply to read aloud.');
    }
    if (spoken.length > MAX_SPEAK_CHARS) {
      throw new BadRequestException('That reply is too long to read aloud at once.');
    }

    const apiKey = await this.requireOpenAiKey(organizationId);
    const response = await this.request(
      `${OPENAI_AUDIO_URL}/speech`,
      apiKey,
      JSON.stringify({
        model: 'tts-1-hd',
        voice: 'alloy',
        input: spoken,
        response_format: 'mp3',
      }),
      'application/json',
    );
    await this.assertOk(response);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length) {
      throw new BadGatewayException('OpenAI returned empty audio.');
    }
    return bytes;
  }

  private async requireOpenAiKey(organizationId: string) {
    const key = await this.providers.getDecryptedKey(
      organizationId,
      AiProvider.OPENAI,
    );
    if (!key?.apiKey) {
      throw new BadRequestException(
        'Connect OpenAI to use server voice transcription and playback.',
      );
    }
    return key.apiKey;
  }

  private async request(
    url: string,
    apiKey: string,
    body: FormData | string,
    contentType?: string,
  ) {
    try {
      return await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...(contentType ? { 'Content-Type': contentType } : {}),
        },
        body,
        signal: AbortSignal.timeout(60_000),
      });
    } catch {
      throw new ServiceUnavailableException(
        'Could not reach OpenAI voice services. Please try again shortly.',
      );
    }
  }

  private async assertOk(response: Response) {
    if (response.ok) return;
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    const message = body.error?.message ?? 'OpenAI voice request failed';
    if (response.status === 401) {
      throw new BadRequestException(
        'The stored OpenAI API key was rejected. Please reconnect the provider.',
      );
    }
    if (response.status === 429) {
      throw new ServiceUnavailableException(
        'OpenAI voice quota was reached. Try again later.',
      );
    }
    throw new BadGatewayException(message);
  }
}
