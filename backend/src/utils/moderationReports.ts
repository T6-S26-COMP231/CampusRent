import { Listing } from '../models/Listing';
import {
  Report,
  ReportDoc,
  ReportModerationStatus,
  ReportTargetType,
  normalizeReportModerationStatus,
} from '../models/Report';
import { User, UserDoc } from '../models/User';

/**
 * US-23.3 / US-23.5 — resolve Report rows for admin list/detail APIs.
 * Status is the persisted Report.status (default/open for legacy docs).
 * Missing targets return exists=false; the Report itself still resolves.
 */

export interface AdminReporterView {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
}

export interface AdminModerationReportDetail {
  report_id: number;
  reporter_id: number;
  reporter: AdminReporterView | null;
  reporter_label: string;
  reason: string;
  details: string;
  created_at: string;
  status: ReportModerationStatus;
  target_type: ReportTargetType;
  target_id: number;
}

export interface AdminListingTargetView {
  target_type: 'listing';
  listing_id: number;
  exists: boolean;
  title: string | null;
  owner_id: number | null;
  owner_label: string | null;
  category: string | null;
  availability: 'available' | 'unavailable' | null;
  description_preview: string | null;
}

export interface AdminUserTargetView {
  target_type: 'user';
  user_id: number;
  exists: boolean;
  display_name: string | null;
  email: string | null;
  verification_status: 'pending' | 'verified' | 'rejected' | null;
  account_status: 'active' | 'suspended' | null;
}

export type AdminModerationTargetView = AdminListingTargetView | AdminUserTargetView;

/** Compatible with frontend ModerationReportView. */
export interface AdminModerationReportView {
  report: AdminModerationReportDetail;
  target: AdminModerationTargetView;
}

function personLabel(
  user: Pick<UserDoc, 'first_name' | 'last_name' | 'email'> | null | undefined,
  fallbackId: number
): string {
  if (!user) return `User #${fallbackId}`;
  const name = `${user.first_name} ${user.last_name}`.trim();
  if (name) return name;
  if (user.email?.trim()) return user.email.trim();
  return `User #${fallbackId}`;
}

function toReporterView(user: UserDoc | null): AdminReporterView | null {
  if (!user) return null;
  return {
    id: user._id,
    first_name: user.first_name,
    last_name: user.last_name,
    email: user.email,
  };
}

async function resolveListingTarget(listingId: number): Promise<AdminListingTargetView> {
  const listing = await Listing.findById(listingId).lean();
  if (!listing) {
    return {
      target_type: 'listing',
      listing_id: listingId,
      exists: false,
      title: null,
      owner_id: null,
      owner_label: null,
      category: null,
      availability: null,
      description_preview: null,
    };
  }

  const owner = await User.findById(listing.owner_id).lean();
  return {
    target_type: 'listing',
    listing_id: listing._id,
    exists: true,
    title: listing.title,
    owner_id: listing.owner_id,
    owner_label: personLabel(owner, listing.owner_id),
    category: listing.category,
    availability: listing.availability,
    description_preview: listing.description,
  };
}

async function resolveUserTarget(userId: number): Promise<AdminUserTargetView> {
  const user = await User.findById(userId).lean();
  if (!user) {
    return {
      target_type: 'user',
      user_id: userId,
      exists: false,
      display_name: null,
      email: null,
      verification_status: null,
      account_status: null,
    };
  }

  return {
    target_type: 'user',
    user_id: user._id,
    exists: true,
    display_name: personLabel(user, user._id),
    email: user.email,
    verification_status: user.verification_status,
    account_status: user.status,
  };
}

export async function resolveModerationTarget(
  targetType: ReportTargetType,
  targetId: number
): Promise<AdminModerationTargetView> {
  return targetType === 'listing'
    ? resolveListingTarget(targetId)
    : resolveUserTarget(targetId);
}

export async function toAdminModerationReportView(
  report: ReportDoc
): Promise<AdminModerationReportView> {
  const reporter = await User.findById(report.reporter_id).lean();
  const target = await resolveModerationTarget(report.target_type, report.target_id);

  return {
    report: {
      report_id: report._id,
      reporter_id: report.reporter_id,
      reporter: toReporterView(reporter),
      reporter_label: personLabel(reporter, report.reporter_id),
      reason: report.reason,
      details: report.details,
      created_at: report.created_at.toISOString(),
      status: normalizeReportModerationStatus(report.status),
      target_type: report.target_type,
      target_id: report.target_id,
    },
    target,
  };
}

/** Newest reports first (created_at desc, then id desc). */
export async function listAdminModerationReports(): Promise<AdminModerationReportView[]> {
  const reports = await Report.find().sort({ created_at: -1, _id: -1 }).lean();
  return Promise.all(reports.map((report) => toAdminModerationReportView(report)));
}

export async function getAdminModerationReport(
  reportId: number
): Promise<AdminModerationReportView | null> {
  const report = await Report.findById(reportId).lean();
  if (!report) return null;
  return toAdminModerationReportView(report);
}
