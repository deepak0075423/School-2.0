/**
 * In-memory SSE client registry.
 * Maps  userId (string) → Set<Express Response>
 *
 * Works perfectly on a single-server setup (PM2 cluster mode needs
 * Redis pub/sub — swap pushMany() implementation if you scale later).
 */
const clients = new Map();

const sseClients = {
    /** Register a new SSE connection for a user. */
    add(userId, res) {
        const id = userId.toString();
        if (!clients.has(id)) clients.set(id, new Set());
        clients.get(id).add(res);
    },

    /** Remove a connection (called on request close). */
    remove(userId, res) {
        const id = userId.toString();
        const set = clients.get(id);
        if (!set) return;
        set.delete(res);
        if (set.size === 0) clients.delete(id);
    },

    /** Push a named SSE event to one user (all their open tabs). */
    push(userId, event, data) {
        const id = userId.toString();
        const set = clients.get(id);
        if (!set || set.size === 0) return;
        const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        for (const res of set) {
            try { res.write(msg); } catch { /* tab closed mid-write */ }
        }
    },

    /** Push to multiple users at once (used after bulk receipt creation). */
    pushMany(userIds, event, data) {
        const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        for (const uid of userIds) {
            const set = clients.get(uid.toString());
            if (!set) continue;
            for (const res of set) {
                try { res.write(msg); } catch { /* ignore */ }
            }
        }
    },

    /** How many users are currently connected (for diagnostics). */
    size() { return clients.size; },
};

module.exports = sseClients;
