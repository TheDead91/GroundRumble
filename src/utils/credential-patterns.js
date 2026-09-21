export const PROVIDER_TOKEN_PATTERN = String.raw`\b(?:sk-|sk-ant-|gsk_|hf_|AIza|ya29\.|ghp_|gho_|github_pat_|glpat-|AKIA|SG\.|xoxb-|xai-|pplx-|rk-|kv-|sk_live_|sk_test_|whsec_|v1\.public\.|NQ-)[A-Za-z0-9_.-]+`;

export const HIGH_ENTROPY_TOKEN_PATTERN = String.raw`\b[A-Za-z0-9+/=_-]{40,}\b`;
