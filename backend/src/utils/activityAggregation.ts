/**
 * US-24.4 — real MongoDB activity metric aggregation for admin reports.
 *
 * Produces ActivityReport-shaped aggregates using countDocuments only.
 * Date-range / listing-category filter application is deferred to US-24.5 (#183).
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
  buildActivityReport,
  defaultActivityFilters,
  emptyActivityMetricCounts,
} from './activityMetrics';

/**
 * Count every approved metric against the live database.
 *
 * `filters` is accepted so #183 can apply created_at / listing_category
 * constraints without changing the call shape. US-24.4 does not apply those
 * restrictions yet — callers get the complete platform aggregate.
 */
export async function countActivityMetrics(
  _filters: ActivityReportFilters = defaultActivityFilters()
): Promise<ActivityMetricCounts> {
  void _filters;

  const [
    total_registered_students,
    verified_students,
    pending_students,
    rejected_students,
    suspended_users,
    total_listings,
    available_listings,
    unavailable_listings,
    total_rental_requests,
    pending_rental_requests,
    accepted_rental_requests,
    declined_rental_requests,
    cancelled_rental_requests,
    completed_rental_requests,
    total_reports,
    open_reports,
    resolved_reports,
    dismissed_reports,
    total_reviews,
    total_conversations,
    total_messages,
  ] = await Promise.all([
    User.countDocuments({ role: 'student' }),
    User.countDocuments({ role: 'student', verification_status: 'verified' }),
    User.countDocuments({ role: 'student', verification_status: 'pending' }),
    User.countDocuments({ role: 'student', verification_status: 'rejected' }),
    User.countDocuments({ status: 'suspended' }),
    Listing.countDocuments({}),
    Listing.countDocuments({ availability: 'available' }),
    Listing.countDocuments({ availability: 'unavailable' }),
    RentalRequest.countDocuments({}),
    RentalRequest.countDocuments({ status: 'pending' }),
    RentalRequest.countDocuments({ status: 'accepted' }),
    RentalRequest.countDocuments({ status: 'declined' }),
    RentalRequest.countDocuments({ status: 'cancelled' }),
    RentalRequest.countDocuments({ status: 'completed' }),
    Report.countDocuments({}),
    Report.countDocuments({ status: 'open' }),
    Report.countDocuments({ status: 'resolved' }),
    Report.countDocuments({ status: 'dismissed' }),
    Review.countDocuments({}),
    Conversation.countDocuments({}),
    Message.countDocuments({}),
  ]);

  const counts = emptyActivityMetricCounts();
  counts.total_registered_students = total_registered_students;
  counts.verified_students = verified_students;
  counts.pending_students = pending_students;
  counts.rejected_students = rejected_students;
  counts.suspended_users = suspended_users;
  counts.total_listings = total_listings;
  counts.available_listings = available_listings;
  counts.unavailable_listings = unavailable_listings;
  counts.total_rental_requests = total_rental_requests;
  counts.pending_rental_requests = pending_rental_requests;
  counts.accepted_rental_requests = accepted_rental_requests;
  counts.declined_rental_requests = declined_rental_requests;
  counts.cancelled_rental_requests = cancelled_rental_requests;
  counts.completed_rental_requests = completed_rental_requests;
  counts.total_reports = total_reports;
  counts.open_reports = open_reports;
  counts.resolved_reports = resolved_reports;
  counts.dismissed_reports = dismissed_reports;
  counts.total_reviews = total_reviews;
  counts.total_conversations = total_conversations;
  counts.total_messages = total_messages;
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
