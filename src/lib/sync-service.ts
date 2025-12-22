import { db, SyncMutation } from './db';


class SyncService {
    private isSyncing = false;
    private online = navigator.onLine;

    constructor() {
        window.addEventListener('online', () => {
            this.online = true;
            this.processQueue();
        });
        window.addEventListener('offline', () => {
            this.online = false;
        });
    }

    /**
     * Add a mutation to the queue and try to sync immediately if online.
     */
    async enqueueMutation(url: string, method: 'POST' | 'PUT' | 'DELETE' | 'PATCH', body: any) {
        await db.mutation_queue.add({
            url,
            method,
            body,
            timestamp: Date.now(),
            retryCount: 0,
            status: 'pending'
        });
        this.processQueue();
    }

    /**
     * Process the queue sequentially.
     */
    async processQueue() {
        if (this.isSyncing || !this.online) return;

        this.isSyncing = true;

        try {
            // Get all pending mutations sorted by ID (FIFO)
            const mutations = await db.mutation_queue
                .where('status')
                .equals('pending')
                .sortBy('id');

            for (const mutation of mutations) {
                if (!this.online) break; // Stop if we go offline during sync

                try {
                    await this.syncItem(mutation);
                    // On success, delete from queue
                    if (mutation.id) {
                        await db.mutation_queue.delete(mutation.id);
                    }
                } catch (error) {
                    console.error(`Sync failed for mutation ${mutation.id}:`, error);
                    // Retries and error handling would go here (e.g. max retries -> failed status)
                }
            }
        } finally {
            this.isSyncing = false;
        }
    }

    private async syncItem(mutation: SyncMutation) {
        // Mark as processing (optional, UI feedback)
        // await db.mutation_queue.update(mutation.id!, { status: 'processing' });

        const response = await fetchWithAuth(mutation.url, {
            method: mutation.method,
            body: JSON.stringify(mutation.body),
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            // If 4xx (client error), maybe mark as failed permanently?
            // If 5xx or network, throw to retry later
            if (response.status >= 500 || response.status === 408) {
                throw new Error(`Server Error: ${response.status}`);
            }
            // For now, simple throw to keep in queue (needs better strategy later)
            throw new Error(`Request failed: ${response.statusText}`);
        }
    }
}

export const syncService = new SyncService();
