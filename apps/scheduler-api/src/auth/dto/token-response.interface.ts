export interface TokenResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  claims: {
    sub: string;
    roles: string[];
    tenant_id: number;
  };
}
