/**
 * US-24.4 / US-24.5 — MongoDB activity metric aggregation for admin reports.
 *
 * Produces ActivityReport-shaped aggregates using countDocuments only.
 * Applies created_at date range and listing_category (listings only).
 * Frontend wiring belongs to US-24.6 (#184).
 *
 * Privacy: aggregate counts only — never load or return PII, message bodies,
 * report narratives, review comments, or secrets.
 */

import { Conversation } from '../models/Conversation';
import { Listing } from '../models/Listing';
import { Message } from '../models/Message';
import { RentalRequest } from '../models/RentalRequest';
import { Report } from '../models/Report';
import { Review } from '../models/Review';
import { User } from '../models/User';
import {
  ActivityMetricCounts,
  ActivityReport,
  ActivityReportFilters,
  ActivityScope,
  activityCreatedAtMongoFilter,
  buildActivityReport,
  defaultActivityFilters,
  emptyActivityMetricCounts,
} from './activityMetrics';

type MongoFilter = Record<string, unknown>;

function withCreatedAt(
  base: MongoFilter,
  filters: ActivityReportFilters
): MongoFilter {
  return { ...base, ...activityCreatedAtMongoFilter(filters.start_date, filters.end_date) };
}

function listingMatch(filters: ActivityReportFilters): MongoFilter {
  const match: MongoFilter = {
    ...activityCreatedAtMongoFilter(filters.start_date, filters.end_date),
  };
  if (filters.listing_category) {
    match.category = filters.listing_category;
  }
  return match;
}

function scopeNeeds(
  scope: ActivityScope,
  group: 'users' | 'listings' | 'rental_requests' | 'reports' | 'reviews' | 'messaging'
): boolean {
  if (scope === 'all') return true;
  return scope === group;
}

/**
 * Count approved metrics against the live database with date/category filters.
 * Only collections relevant to activity_scope are queried.
 */
export async function countActivityMetrics(
  filters: ActivityReportFilters = defaultActivityFilters()
): Promise<ActivityMetricCounts> {
  const counts = emptyActivityMetricCounts();
  const scope = filters.activity_scope;
  const tasks: Array<Promise<void>> = [];

  if (scopeNeeds(scope, 'users')) {
    tasks.push(
      (async () => {
        const [
          total_registered_students,
          verified_students,
          pending_students,
          rejected_students,
          suspended_users,
        ] = await Promise.all([
          User.countDocuments(withCreatedAt({ role: 'student' }, filters)),
          User.countDocuments(
            withCreatedAt(
              { role: 'student', verification_status: 'verified' },
              filters
            )
          ),
          User.countDocuments(
            withCreatedAt(
              { role: 'student', verification_status: 'pending' },
              filters
            )
          ),
          User.countDocuments(
            withCreatedAt(
              { role: 'student', verification_status: 'rejected' },
              filters
            )
          ),
          User.countDocuments(withCreatedAt({ status: 'suspended' }, filters)),
        ]);
        counts.total_registered_students = total_registered_students;
        counts.verified_students = verified_students;
        counts.pending_students = pending_students;
        counts.rejected_students = rejected_students;
        counts.suspended_users = suspended_users;
      })()
    );
  }

  if (scopeNeeds(scope, 'listings')) {
    const listingBase = listingMatch(filters);
    tasks.push(
      (async () => {
        const [total_listings, available_listings, unavailable_listings] =
          await Promise.all([
            Listing.countDocuments(listingBase),
            Listing.countDocuments({
              ...listingBase,
              availability: 'available',
            }),
            Listing.countDocuments({
              ...listingBase,
              availability: 'unavailable',
            }),
          ]);
        counts.total_listings = total_listings;
        counts.available_listings = available_listings;
        counts.unavailable_listings = unavailable_listings;
      })()
    );
  }

  if (scopeNeeds(scope, 'rental_requests')) {
    tasks.push(
      (async () => {
        const [
          total_rental_requests,
          pending_rental_requests,
          accepted_rental_requests,
          declined_rental_requests,
          cancelled_rental_requests,
          completed_rental_requests,
        ] = await Promise.all([
          RentalRequest.countDocuments(withCreatedAt({}, filters)),
          RentalRequest.countDocuments(
            withCreatedAt({ status: 'pending' }, filters)
          ),
          RentalRequest.countDocuments(
            withCreatedAt({ status: 'accepted' }, filters)
          ),
          RentalRequest.countDocuments(
            withCreatedAt({ status: 'declined' }, filters)
          ),
          RentalRequest.countDocuments(
            withCreatedAt({ status: 'cancelled' }, filters)
          ),
          RentalRequest.countDocuments(
            withCreatedAt({ status: 'completed' }, filters)
          ),
        ]);
        counts.total_rental_requests = total_rental_requests;
        counts.pending_rental_requests = pending_rental_requests;
        counts.accepted_rental_requests = accepted_rental_requests;
        counts.declined_rental_requests = declined_rental_requests;
        counts.cancelled_rental_requests = cancelled_rental_requests;
        counts.completed_rental_requests = completed_rental_requests;
      })()
    );
  }

  if (scopeNeeds(scope, 'reports')) {
    tasks.push(
      (async () => {
        const [total_reports, open_reports, resolved_reports, dismissed_reports] =
          await Promise.all([
            Report.countDocuments(withCreatedAt({}, filters)),
            Report.countDocuments(withCreatedAt({ status: 'open' }, filters)),
            Report.countDocuments(
              withCreatedAt({ status: 'resolved' }, filters)
            ),
            Report.countDocuments(
              withCreatedAt({ status: 'dismissed' }, filters)
            ),
          ]);
        counts.total_reports = total_reports;
        counts.open_reports = open_reports;
        counts.resolved_reports = resolved_reports;
        counts.dismissed_reports = dismissed_reports;
      })()
    );
  }

  if (scopeNeeds(scope, 'reviews')) {
    tasks.push(
      (async () => {
        counts.total_reviews = await Review.countDocuments(
          withCreatedAt({}, filters)
        );
      })()
    );
  }

  if (scopeNeeds(scope, 'messaging')) {
    tasks.push(
      (async () => {
        const [total_conversations, total_messages] = await Promise.all([
          Conversation.countDocuments(withCreatedAt({}, filters)),
          Message.countDocuments(withCreatedAt({}, filters)),
        ]);
        counts.total_conversations = total_conversations;
        counts.total_messages = total_messages;
      })()
    );
  }

  await Promise.all(tasks);
  return counts;
}

/**
 * Build the administrative activity summary from live counts.
 * `generatedAt` is always server-owned — never accept a client timestamp.
 */
export async function aggregateActivityReport(
  filters: ActivityReportFilters = defaultActivityFilters(),
  generatedAt: Date = new Date()
): Promise<ActivityReport> {
  const counts = await countActivityMetrics(filters);
  return buildActivityReport(counts, filters, generatedAt);
}
