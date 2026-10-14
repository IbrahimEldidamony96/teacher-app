# Feature implementation

Requested 9 October 2026. Each item includes its own implementation and verification before being marked complete.

- [ ] 1. Student editing, student/group archive and restore
- [ ] 2. Stable monthly charges, enrollment end dates, editable discounts, credits and refunds
- [ ] 3. Parent assignment instructions and visible overdue homework
- [ ] 4. Editing assignments, exams and weekly lessons
- [ ] 5. Dated cancellations, holidays, rescheduling and makeup lessons
- [ ] 6. Secure parent invitations, linked-child classroom list and recording access
- [ ] 7. Notification history, retries, delivery receipts and scheduled reminders
- [ ] 8. Date-range reports, CSV/Excel-compatible exports and printable receipts
- [ ] 9. Roster search, filters, pagination, CSV import and bulk enrollment
- [ ] 10. Paymob checkout and authenticated, idempotent payment callbacks
- [ ] 11. Private assignment attachments and homework submissions
- [ ] 12. Online multiple-choice quizzes with server-side grading
- [ ] 13. Screen sharing and live lesson recording
- [ ] 14. Teacher-controlled student microphone participation

Live Paymob checkout requires merchant keys and a public HTTPS callback address. WhatsApp delivery receipts require registering the webhook with Meta. Tests must use mocked providers and disposable databases; implementation does not authorize sending real messages or charging cards during verification.
