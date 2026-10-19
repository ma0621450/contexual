import { BadRequestException } from '@nestjs/common';
import { AiProvider } from '@contexual/database';
import { SpeechService } from './speech.service';

describe('SpeechService', () => {
  const providers = {
    getDecryptedKey: jest.fn(),
  };

  function service(fetchImpl: typeof fetch) {
    const speech = new SpeechService(providers as never);
    speech.fetchImpl = fetchImpl;
    return speech;
  }

  beforeEach(() => {
    providers.getDecryptedKey.mockReset();
  });

  it('rejects a recording when OpenAI is not connected', async () => {
    providers.getDecryptedKey.mockResolvedValue(null);
    const speech = service(jest.fn());

    await expect(
      speech.transcribe('org-1', {
        buffer: Buffer.from('audio'),
        mimetype: 'audio/webm',
        size: 5,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(providers.getDecryptedKey).toHaveBeenCalledWith(
      'org-1',
      AiProvider.OPENAI,
    );
  });

  it('returns the Whisper transcript', async () => {
    providers.getDecryptedKey.mockResolvedValue({ apiKey: 'sk-test' });
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: '  hello there  ' }),
    });
    const speech = service(fetchImpl);

    await expect(
      speech.transcribe('org-1', {
        buffer: Buffer.from('audio'),
        mimetype: 'audio/webm;codecs=opus',
        size: 5,
        originalname: 'speech.webm',
      }),
    ).resolves.toEqual({ text: 'hello there' });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.openai.com/v1/audio/transcriptions',
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer sk-test' },
      }),
    );
  });

  it('returns synthesized mp3 bytes', async () => {
    providers.getDecryptedKey.mockResolvedValue({ apiKey: 'sk-test' });
    const bytes = new Uint8Array([1, 2, 3]);
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => bytes.buffer,
    });
    const speech = service(fetchImpl);

    const audio = await speech.synthesize('org-1', ' Hello. ');
    expect(Buffer.isBuffer(audio)).toBe(true);
    expect(audio.length).toBe(3);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.openai.com/v1/audio/speech',
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer sk-test',
          'Content-Type': 'application/json',
        },
      }),
    );
  });

  it('rejects an empty reply', async () => {
    const speech = service(jest.fn());
    await expect(speech.synthesize('org-1', '   ')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
