import fs from 'fs';
import path from 'path';

export interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  phone: string;
  role: 'student' | 'admin';
  verification_status: 'pending' | 'verified' | 'rejected';
  status: 'active' | 'suspended';
  created_at: string;
}

export interface ListingRow {
  id: number;
  owner_id: number;
  title: string;
  category: string;
  description: string;
  rental_terms: string;
  availability: 'available' | 'unavailable';
  created_at: string;
  updated_at: string;
}

export interface ListingImageRow {
  id: number;
  listing_id: number;
  filename: string;
  created_at: string;
}

export interface RentalRequestRow {
  id: number;
  listing_id: number;
  renter_id: number;
  start_date: string;
  end_date: string;
  status: 'pending' | 'accepted';
  created_at: string;
  updated_at: string;
}

interface DatabaseSchema {
  users: UserRow[];
  listings: ListingRow[];
  listing_images: ListingImageRow[];
  rental_requests: RentalRequestRow[];
  _counters: Record<string, number>;
}

type Row = Record<string, unknown>;

const dataDir = path.join(__dirname, '..', 'data');
const dbPath = path.join(dataDir, 'store.json');

const emptyDb = (): DatabaseSchema => ({
  users: [],
  listings: [],
  listing_images: [],
  rental_requests: [],
  _counters: {},
});

let data: DatabaseSchema = emptyDb();

function load() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dbPath)) {
    data = emptyDb();
    return;
  }

  const stored = JSON.parse(fs.readFileSync(dbPath, 'utf-8')) as Partial<DatabaseSchema>;
  data = {
    users: stored.users || [],
    listings: stored.listings || [],
    listing_images: stored.listing_images || [],
    rental_requests: (stored.rental_requests || []).filter((request) =>
      request.status === 'pending' || request.status === 'accepted'
    ) as RentalRequestRow[],
    _counters: stored._counters || {},
  };
}

function save() {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

function nextId(table: string): number {
  const current = Math.max(
    data._counters[table] || 0,
    ...((data as unknown as Record<string, Array<{ id?: number }>>)[table] || []).map((row) => row.id || 0)
  );
  const id = current + 1;
  data._counters[table] = id;
  return id;
}

export function initDatabase() {
  load();
}

function normalise(sql: string) {
  return sql.replace(/\s+/g, ' ').trim();
}

function listingSearch(sql: string, params: unknown[]) {
  let index = 0;
  let results = [...data.listings];

  if (sql.includes("l.availability = 'available'")) {
    results = results.filter((listing) => listing.availability === 'available');
  }
  if (sql.includes('(l.title LIKE ? OR l.description LIKE ?)')) {
    const raw = String(params[index++] || '').replaceAll('%', '').toLowerCase();
    index += 1;
    results = results.filter((listing) =>
      listing.title.toLowerCase().includes(raw) || listing.description.toLowerCase().includes(raw)
    );
  }
  if (sql.includes('l.category = ?')) {
    const category = String(params[index++]);
    results = results.filter((listing) => listing.category === category);
  }
  if (sql.includes('l.availability = ?')) {
    const availability = String(params[index++]);
    results = results.filter((listing) => listing.availability === availability);
  }

  results.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return { results, nextParamIndex: index };
}

class Statement {
  constructor(private readonly sql: string) {}

  get(...params: unknown[]): Row | undefined {
    return this.all(...params)[0];
  }

  all(...params: unknown[]): Row[] {
    const sql = normalise(this.sql);

    if (sql === 'SELECT id FROM users WHERE email = ?') {
      const user = data.users.find((item) => item.email === params[0]);
      return user ? [{ id: user.id }] : [];
    }
    if (sql === 'SELECT * FROM users WHERE email = ?') {
      const user = data.users.find((item) => item.email === params[0]);
      return user ? [user as unknown as Row] : [];
    }
    if (sql === 'SELECT * FROM users WHERE id = ?') {
      const user = data.users.find((item) => item.id === Number(params[0]));
      return user ? [user as unknown as Row] : [];
    }
    if (sql.includes('SELECT id, email, role, verification_status, status, first_name, last_name')) {
      const user = data.users.find((item) => item.id === Number(params[0]));
      return user ? [user as unknown as Row] : [];
    }
    if (sql.includes('SELECT id, email, first_name, last_name, role, verification_status, status, created_at')) {
      const user = data.users.find((item) => item.id === Number(params[0]));
      return user ? [user as unknown as Row] : [];
    }
    if (sql.includes('SELECT id, email, first_name, last_name, phone, bio, role')) {
      const user = data.users.find((item) => item.id === Number(params[0]));
      return user ? [user as unknown as Row] : [];
    }
    if (sql.includes('SELECT id, first_name, last_name, email, phone FROM users WHERE id')) {
      const user = data.users.find((item) => item.id === Number(params[0]));
      return user
        ? [{ id: user.id, first_name: user.first_name, last_name: user.last_name, email: user.email, phone: user.phone }]
        : [];
    }
    if (sql.includes("FROM users WHERE role = 'student' AND verification_status = 'pending'")) {
      return data.users
        .filter((user) => user.role === 'student' && user.verification_status === 'pending')
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((user) => ({
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          verification_status: user.verification_status,
          created_at: user.created_at,
        }));
    }

    if (sql === 'SELECT COUNT(*) as c FROM listings') return [{ c: data.listings.length }];
    if (sql.includes('SELECT COUNT(*) as total FROM listings l')) {
      return [{ total: listingSearch(sql, params).results.length }];
    }
    if (sql.startsWith('SELECT l.* FROM listings l')) {
      const { results, nextParamIndex } = listingSearch(sql, params);
      const limit = Number(params[nextParamIndex] || results.length);
      const offset = Number(params[nextParamIndex + 1] || 0);
      return results.slice(offset, offset + limit) as unknown as Row[];
    }
    if (sql === 'SELECT * FROM listings WHERE owner_id = ? ORDER BY created_at DESC') {
      return data.listings
        .filter((listing) => listing.owner_id === Number(params[0]))
        .sort((a, b) => b.created_at.localeCompare(a.created_at)) as unknown as Row[];
    }
    if (sql === 'SELECT * FROM listings WHERE id = ?') {
      const listing = data.listings.find((item) => item.id === Number(params[0]));
      return listing ? [listing as unknown as Row] : [];
    }
    if (sql.includes('SELECT id, title, category, owner_id FROM listings WHERE id')) {
      const listing = data.listings.find((item) => item.id === Number(params[0]));
      return listing
        ? [{ id: listing.id, title: listing.title, category: listing.category, owner_id: listing.owner_id }]
        : [];
    }
    if (sql.includes('SELECT owner_id, availability FROM listings WHERE id')) {
      const listing = data.listings.find((item) => item.id === Number(params[0]));
      return listing ? [{ owner_id: listing.owner_id, availability: listing.availability }] : [];
    }
    if (sql.includes('SELECT owner_id FROM listings WHERE id')) {
      const listing = data.listings.find((item) => item.id === Number(params[0]));
      return listing ? [{ owner_id: listing.owner_id }] : [];
    }
    if (sql.includes('SELECT id, filename FROM listing_images WHERE listing_id') && sql.includes('filename = ?')) {
      const image = data.listing_images.find((item) =>
        item.listing_id === Number(params[0]) && item.filename === String(params[1])
      );
      return image ? [image as unknown as Row] : [];
    }
    if (sql.includes('SELECT id, filename FROM listing_images WHERE listing_id')) {
      return data.listing_images
        .filter((image) => image.listing_id === Number(params[0]))
        .sort((a, b) => a.id - b.id) as unknown as Row[];
    }
    if (sql === 'SELECT filename FROM listing_images WHERE listing_id = ?') {
      return data.listing_images
        .filter((image) => image.listing_id === Number(params[0]))
        .map((image) => ({ filename: image.filename }));
    }
    if (sql.includes('SELECT COUNT(*) as c FROM listing_images WHERE listing_id')) {
      return [{ c: data.listing_images.filter((image) => image.listing_id === Number(params[0])).length }];
    }

    if (sql === 'SELECT * FROM rental_requests WHERE id = ?') {
      const request = data.rental_requests.find((item) => item.id === Number(params[0]));
      return request ? [request as unknown as Row] : [];
    }
    if (
      sql ===
      'SELECT * FROM rental_requests WHERE listing_id = ? AND renter_id = ? ORDER BY created_at DESC'
    ) {
      return data.rental_requests
        .filter(
          (request) =>
            request.listing_id === Number(params[0]) &&
            request.renter_id === Number(params[1])
        )
        .sort((a, b) => b.created_at.localeCompare(a.created_at)) as unknown as Row[];
    }
    if (sql.includes('JOIN listings l ON l.id = rr.listing_id')) {
      return data.rental_requests
        .filter((request) => {
          const listing = data.listings.find((item) => item.id === request.listing_id);
          return listing?.owner_id === Number(params[0]);
        })
        .sort((a, b) => b.created_at.localeCompare(a.created_at)) as unknown as Row[];
    }
    if (sql.includes("SELECT id FROM rental_requests") && sql.includes("status = 'pending'")) {
      const request = data.rental_requests.find((item) =>
        item.listing_id === Number(params[0]) &&
        item.renter_id === Number(params[1]) &&
        item.status === 'pending'
      );
      return request ? [{ id: request.id }] : [];
    }

    return [];
  }

  run(...params: unknown[]): { lastInsertRowid: number; changes: number } {
    const sql = normalise(this.sql);
    let lastInsertRowid = 0;
    let changes = 0;

    if (sql.startsWith('INSERT INTO users')) {
      const id = nextId('users');
      lastInsertRowid = id;
      data.users.push({
        id,
        email: String(params[0]),
        password_hash: String(params[1]),
        first_name: String(params[2] || ''),
        last_name: String(params[3] || ''),
        phone: String(params[4] || ''),
        role: (params[6] as UserRow['role']) || 'student',
        verification_status: (params[7] as UserRow['verification_status']) || 'pending',
        status: 'active',
        created_at: new Date().toISOString(),
      });
      changes = 1;
    } else if (sql.startsWith('INSERT INTO listings')) {
      const id = nextId('listings');
      lastInsertRowid = id;
      const now = new Date().toISOString();
      data.listings.push({
        id,
        owner_id: Number(params[0]),
        title: String(params[1]),
        category: String(params[2]),
        description: String(params[3]),
        rental_terms: String(params[4] || ''),
        availability: (params[5] as ListingRow['availability']) || 'available',
        created_at: now,
        updated_at: now,
      });
      changes = 1;
    } else if (sql.startsWith('INSERT INTO listing_images')) {
      const id = nextId('listing_images');
      lastInsertRowid = id;
      data.listing_images.push({
        id,
        listing_id: Number(params[0]),
        filename: String(params[1]),
        created_at: new Date().toISOString(),
      });
      changes = 1;
    } else if (sql.startsWith('INSERT INTO rental_requests')) {
      const id = nextId('rental_requests');
      lastInsertRowid = id;
      const now = new Date().toISOString();
      data.rental_requests.push({
        id,
        listing_id: Number(params[0]),
        renter_id: Number(params[1]),
        start_date: String(params[2]),
        end_date: String(params[3]),
        status: 'pending',
        created_at: now,
        updated_at: now,
      });
      changes = 1;
    } else if (sql.includes('UPDATE users SET verification_status')) {
      const user = data.users.find((item) => item.id === Number(params[1]));
      if (user) {
        user.verification_status = params[0] as UserRow['verification_status'];
        changes = 1;
      }
    } else if (sql.includes('UPDATE listings SET title')) {
      const listing = data.listings.find((item) => item.id === Number(params[4]));
      if (listing) {
        listing.title = String(params[0]);
        listing.category = String(params[1]);
        listing.description = String(params[2]);
        listing.rental_terms = String(params[3] || '');
        listing.updated_at = new Date().toISOString();
        changes = 1;
      }
    } else if (sql.includes('UPDATE listings SET availability')) {
      const listing = data.listings.find((item) => item.id === Number(params[1]));
      if (listing) {
        listing.availability = params[0] as ListingRow['availability'];
        listing.updated_at = new Date().toISOString();
        changes = 1;
      }
    } else if (sql.includes("UPDATE rental_requests SET status = 'accepted'")) {
      const request = data.rental_requests.find((item) => item.id === Number(params[0]));
      if (request) {
        request.status = 'accepted';
        request.updated_at = new Date().toISOString();
        changes = 1;
      }
    } else if (sql.startsWith('DELETE FROM listing_images WHERE id')) {
      const id = Number(params[0]);
      const before = data.listing_images.length;
      data.listing_images = data.listing_images.filter((image) => image.id !== id);
      changes = before === data.listing_images.length ? 0 : 1;
    } else if (sql.startsWith('DELETE FROM listings WHERE id')) {
      const id = Number(params[0]);
      const before = data.listings.length;
      data.listings = data.listings.filter((listing) => listing.id !== id);
      data.listing_images = data.listing_images.filter((image) => image.listing_id !== id);
      data.rental_requests = data.rental_requests.filter((request) => request.listing_id !== id);
      changes = before === data.listings.length ? 0 : 1;
    }

    save();
    return { lastInsertRowid, changes };
  }
}

const db = {
  prepare(sql: string) {
    return new Statement(sql);
  },
};

export default db;
