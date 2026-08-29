/** Saudi Arabia uses UTC+03:00 year-round. Session descriptors are expressed
 * in Riyadh local time, so an explicit offset keeps rehearsal classification
 * deterministic on tutor devices in any time zone. */
export function isPreSessionRehearsal(
  completedAt: string,
  sessionDate: string,
  sessionStartTime: string
): boolean {
  const completionTimestamp = Date.parse(completedAt);
  const scheduledTimestamp = Date.parse(
    `${sessionDate}T${sessionStartTime}:00+03:00`
  );
  return (
    Number.isFinite(completionTimestamp) &&
    Number.isFinite(scheduledTimestamp) &&
    completionTimestamp < scheduledTimestamp
  );
}
