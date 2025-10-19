export type GqlRequest = {
    endpoint: string;
    query: string;
    variables?: Record<string, any>;
    headers?: Record<string, string>;
    timeoutMs?: number;
};

export async function gqlFetch<T = any>({
    endpoint,
    query,
    variables,
    headers,
    timeoutMs = 8000
}: GqlRequest): Promise<T> {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);

    try {
        const res = await fetch(endpoint, {
            method: "POST",
            headers: { "content-type": "application/json", ...headers },
            body: JSON.stringify({ query, variables }),
            cache: "no-store",
            signal: ac.signal
        });

        if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error(`GraphQL HTTP ${res.status} ${res.statusText} ${text}`);
        }

        const json = await res.json() as { data?: T; errors?: Array<{ message: string }> };
        if (json.errors?.length) throw new Error(json.errors.map(e => e.message).join(" | "));
        if (!json.data) throw new Error("GraphQL response missing data");
        return json.data;
    } finally {
        clearTimeout(t);
    }
}
