import axios from 'axios';

export function getApiErrorMessage(error: unknown, fallback = 'Request failed'): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { error?: string | { message?: string }[] } | undefined;
    if (typeof data?.error === 'string') return data.error;
    if (Array.isArray(data?.error)) {
      const message = data.error
        .map((item) => (typeof item?.message === 'string' ? item.message : ''))
        .filter(Boolean)
        .join(', ');
      if (message) return message;
    }
    if (typeof error.message === 'string' && error.message) return error.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
