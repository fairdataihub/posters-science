interface Window {
  umami?: {
    track: (eventName: string, properties?: Record<string, unknown>) => void;
  };
}
