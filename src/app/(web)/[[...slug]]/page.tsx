export default function PageWrapper() {
    return (
        <main style={{ padding: 24 }}>
            <h1>Main Page</h1>
            <p>Server routes decide navigation. Slug lives under a route group so it never captures /api.</p>
        </main>
    );
}
