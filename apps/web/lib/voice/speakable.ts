const CODE_FENCE = /```[\s\S]*?```/g;

export function toSpeakableText(markdown: string): string {
  const withoutFences = markdown.replace(CODE_FENCE, ' code sample ');
  return withoutFences
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function takeSentences(buffer: string): { ready: string[]; rest: string } {
  const ready: string[] = [];
  let rest = buffer;

  while (rest.trim()) {
    const match = /^[\s\S]*?[.!?](?=\s|$)/.exec(rest);
    if (match && match[0].trim().length <= 500) {
      ready.push(match[0].trim());
      rest = rest.slice(match[0].length).trimStart();
      continue;
    }

    if (rest.length >= 320) {
      const slice = rest.slice(0, 320);
      const space = slice.lastIndexOf(' ');
      const cut = space > 80 ? space : 320;
      ready.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trimStart();
      continue;
    }

    break;
  }

  return { ready, rest };
}

export function composeDictation(
  base: string,
  finals: string[],
  interim: string,
): string {
  const spoken = [...finals, interim]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  const prefix = base.trim();
  if (!spoken) return prefix;
  if (!prefix) return spoken;
  return `${prefix} ${spoken}`;
}

export function voiceErrorMessage(code: string | undefined): string | null {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Allow microphone access to use voice input.';
    case 'audio-capture':
      return 'No microphone was found. Check the device and try again.';
    case 'network':
      return 'Voice recognition lost its connection.';
    case 'language-not-supported':
      return 'This browser cannot recognize the selected language.';
    case 'no-speech':
    case 'aborted':
      return null;
    default:
      return 'Voice input stopped unexpectedly.';
  }
}

export function isFatalVoiceError(code: string | undefined): boolean {
  return (
    code === 'not-allowed' ||
    code === 'service-not-allowed' ||
    code === 'audio-capture' ||
    code === 'language-not-supported'
  );
}
