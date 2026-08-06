import './config/env';
import bcrypt from 'bcryptjs';
import { connectDatabase, disconnectDatabase } from './db/connection';
import { nextId } from './models/Counter';
import { Listing } from './models/Listing';
import { User } from './models/User';

/**
 * Idempotent development seed.
 * Never deletes or replaces existing production/user data — only inserts missing demo rows.
 */
async function seed() {
  await connectDatabase();

  const adminEmail = 'admin@mycentennialcollege.ca';
  let admin = await User.findOne({ email: adminEmail });
  if (!admin) {
    admin = await User.create({
      _id: await nextId('users'),
      email: adminEmail,
      password_hash: bcrypt.hashSync('admin123', 10),
      first_name: 'Campus',
      last_name: 'Admin',
      phone: '',
      role: 'admin',
      verification_status: 'verified',
      status: 'active',
    });
    console.log('Created admin: admin@mycentennialcollege.ca / admin123');
  }

  const studentEmail = 'maria@mycentennialcollege.ca';
  let maria = await User.findOne({ email: studentEmail });
  if (!maria) {
    maria = await User.create({
      _id: await nextId('users'),
      email: studentEmail,
      password_hash: bcrypt.hashSync('student123', 10),
      first_name: 'Maria',
      last_name: 'Santos',
      phone: '416-555-0101',
      role: 'student',
      verification_status: 'verified',
      status: 'active',
    });
    console.log('Created student: maria@mycentennialcollege.ca / student123');
  }

  const johnEmail = 'john@mycentennialcollege.ca';
  let john = await User.findOne({ email: johnEmail });
  if (!john) {
    john = await User.create({
      _id: await nextId('users'),
      email: johnEmail,
      password_hash: bcrypt.hashSync('student123', 10),
      first_name: 'John',
      last_name: 'Chen',
      phone: '416-555-0102',
      role: 'student',
      verification_status: 'verified',
      status: 'active',
    });
  }

  const listingCount = await Listing.countDocuments();
  if (listingCount === 0) {
    const listings = [
      {
        owner_id: maria._id,
        title: 'Organic Chemistry Textbook (3rd Ed.)',
        category: 'Textbooks',
        description:
          'Barely used textbook for CHEM-201. Highlighted key chapters only. Perfect for one semester.',
        rental_terms: 'Pick up on campus. Return within 14 days.',
        availability: 'available' as const,
      },
      {
        owner_id: john._id,
        title: 'TI-84 Plus CE Graphing Calculator',
        category: 'Electronics',
        description:
          'Fully functional graphing calculator. Great for calculus and statistics courses.',
        rental_terms: '30-day maximum rental. Pickup arranged on campus.',
        availability: 'available' as const,
      },
      {
        owner_id: maria._id,
        title: 'Microscope Kit for Bio Lab',
        category: 'Lab Equipment',
        description: 'Compound microscope with slides and cover slips. Used for BIOL-150 labs.',
        rental_terms: 'Handle with care. Return cleaned.',
        availability: 'available' as const,
      },
      {
        owner_id: john._id,
        title: 'Portable Projector (1080p)',
        category: 'Electronics',
        description: 'HDMI projector for presentations and movie nights. Includes carrying case.',
        rental_terms: 'Weekend rentals preferred.',
        availability: 'unavailable' as const,
      },
      {
        owner_id: maria._id,
        title: 'Camping Tent (2-Person)',
        category: 'Sports & Recreation',
        description: 'Lightweight tent for outdoor club trips. Setup instructions included.',
        rental_terms: 'Must return dry and folded.',
        availability: 'available' as const,
      },
    ];

    for (const listing of listings) {
      await Listing.create({
        _id: await nextId('listings'),
        ...listing,
        images: [],
      });
    }
    console.log(`Seeded ${listings.length} sample listings`);
  } else {
    console.log(`Skipped listing seed; ${listingCount} listing(s) already exist.`);
  }

  console.log('Seed complete.');
  await disconnectDatabase();
}

seed().catch(async (error) => {
  const message = error instanceof Error ? error.message : 'Unknown seed failure';
  console.error(`Seed failed: ${message}`);
  try {
    await disconnectDatabase();
  } catch {
    /* ignore disconnect errors during failure cleanup */
  }
  process.exit(1);
});
