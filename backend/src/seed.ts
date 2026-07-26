import bcrypt from 'bcryptjs';
import { initDatabase } from './db';
import db from './db';

initDatabase();

const adminEmail = 'admin@mycentennialcollege.ca';
const existingAdmin = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
if (!existingAdmin) {
  db.prepare(`INSERT INTO users`).run(
    adminEmail,
    bcrypt.hashSync('admin123', 10),
    'Campus',
    'Admin',
    '',
    '',
    'admin',
    'verified'
  );
  console.log('Created admin: admin@mycentennialcollege.ca / admin123');
}

const studentEmail = 'maria@mycentennialcollege.ca';
let mariaId: number;
const existingMaria = db.prepare('SELECT id FROM users WHERE email = ?').get(studentEmail) as
  | { id: number }
  | undefined;

if (!existingMaria) {
  const r = db.prepare(`INSERT INTO users`).run(
    studentEmail,
    bcrypt.hashSync('student123', 10),
    'Maria',
    'Santos',
    '416-555-0101',
    'CS student who loves sharing textbooks and lab gear.',
    'student',
    'verified'
  );
  mariaId = r.lastInsertRowid as number;
  console.log('Created student: maria@mycentennialcollege.ca / student123');
} else {
  mariaId = existingMaria.id;
}

const johnEmail = 'john@mycentennialcollege.ca';
let johnId: number;
const existingJohn = db.prepare('SELECT id FROM users WHERE email = ?').get(johnEmail) as
  | { id: number }
  | undefined;

if (!existingJohn) {
  const r = db.prepare(`INSERT INTO users`).run(
    johnEmail,
    bcrypt.hashSync('student123', 10),
    'John',
    'Chen',
    '416-555-0102',
    'Engineering student with tools and electronics.',
    'student',
    'verified'
  );
  johnId = r.lastInsertRowid as number;
} else {
  johnId = existingJohn.id;
}

const listingCount = (db.prepare('SELECT COUNT(*) as c FROM listings').get() as { c: number }).c;
if (listingCount === 0) {
  const listings = [
    {
      owner_id: mariaId,
      title: 'Organic Chemistry Textbook (3rd Ed.)',
      category: 'Textbooks',
      description:
        'Barely used textbook for CHEM-201. Highlighted key chapters only. Perfect for one semester.',
      rental_terms: 'Pick up on campus. Return within 14 days.',
      availability: 'available',
    },
    {
      owner_id: johnId,
      title: 'TI-84 Plus CE Graphing Calculator',
      category: 'Electronics',
      description:
        'Fully functional graphing calculator. Great for calculus and statistics courses.',
      rental_terms: '30-day maximum rental. Pickup arranged on campus.',
      availability: 'available',
    },
    {
      owner_id: mariaId,
      title: 'Microscope Kit for Bio Lab',
      category: 'Lab Equipment',
      description: 'Compound microscope with slides and cover slips. Used for BIOL-150 labs.',
      rental_terms: 'Handle with care. Return cleaned.',
      availability: 'available',
    },
    {
      owner_id: johnId,
      title: 'Portable Projector (1080p)',
      category: 'Electronics',
      description: 'HDMI projector for presentations and movie nights. Includes carrying case.',
      rental_terms: 'Weekend rentals preferred.',
      availability: 'unavailable',
    },
    {
      owner_id: mariaId,
      title: 'Camping Tent (2-Person)',
      category: 'Sports & Recreation',
      description: 'Lightweight tent for outdoor club trips. Setup instructions included.',
      rental_terms: 'Must return dry and folded.',
      availability: 'available',
    },
  ];

  const insert = db.prepare(`INSERT INTO listings`);
  for (const l of listings) {
    insert.run(
      l.owner_id,
      l.title,
      l.category,
      l.description,
      l.rental_terms,
      l.availability
    );
  }
  console.log(`Seeded ${listings.length} sample listings`);
}

console.log('Seed complete.');
