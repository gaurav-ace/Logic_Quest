import { caching } from './models/caching';
import { cdn } from './models/cdn';
import { loadBalancing } from './models/load-balancing';
import { partition } from './models/partition';
import { payments } from './models/payments';
import { queues } from './models/queues';
import { replication } from './models/replication';
import { scaling } from './models/scaling';
import { sharding } from './models/sharding';
import type { Model } from './types';

/** Every model a sim lesson can name. Each model's own tests check what its lessons claim. */
export const MODELS = [loadBalancing, scaling, caching, cdn, replication, sharding, queues, partition, payments].map((m) => m as unknown as Model<unknown>);

const byId = new Map(MODELS.map((m) => [m.id, m]));

export function getModel(id: string): Model<unknown> | undefined {
  return byId.get(id);
}
