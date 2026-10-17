// A fixed demo token stands in for a real OIDC access token (which a BFF or an auth library would supply).
export const DEMO_TOKEN: string = import.meta.env.VITE_DEMO_TOKEN ?? 'demo-token';
