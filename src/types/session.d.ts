import "next-auth";

declare module "next-auth" {
    interface User {
        roles?: string[];
        parentaccId?: string;
    }
    interface Session {
        user: {
            id?: string;
            name?: string | null;
            email?: string | null;
            roles?: string[];
            parentaccId?: string;
        };
    }
}
