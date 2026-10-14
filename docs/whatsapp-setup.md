# Enable classroom invitations on WhatsApp

The app supports sending each enrolled student's private classroom link to their student's saved phone. Automatic delivery needs your WhatsApp Cloud API account and an approved template. Run `npm run whatsapp:setup` to check the current configuration.

The user requires automatic delivery to the entire group. Copying invitations or opening a prefilled WhatsApp conversation requires a separate manual send and does not meet that requirement. The October 8, 2026 read-only setup check verified that Arabic `classroom_invitation` is `APPROVED`, compatible, and ready. The user subsequently reported five successful invitation sends and zero failures. Those results confirm provider acceptance; recipient delivery receipts were not independently checked. General use requires completing setup of the intended business sender. A managed provider can offer a different onboarding interface, but its template workflow can still require Meta approval; see [Twilio's notification template guide](https://www.twilio.com/docs/whatsapp/tutorial/send-whatsapp-notification-messages-templates).

The user currently chooses to continue with the test sending number. Automatic classroom links require a valid access token, an approved `classroom_invitation` template, and verification of each recipient in Meta's test list. The app checks template approval when the group button prepares invitations and shows a pending-review message before student sends if approval is outstanding. A rejected access token also stops preparation before any student sends or failed-delivery records. Retry the same button after correcting the token or obtaining template approval; it reads fresh status. The sample `hello_world` template has no invitation URL parameters and cannot substitute for the private classroom invitation.

## 1. Set up your Meta account

Open the [Meta app dashboard](https://developers.facebook.com/apps/) and follow its WhatsApp Cloud API setup. You need a business portfolio, a WhatsApp Business Account, and a business phone number. Complete the phone verification yourself in Meta's dashboard. Installing the WhatsApp Business mobile app alone does not provide these API credentials. See [Meta's official Cloud API collection](https://www.postman.com/meta/whatsapp-business-platform/collection/wlk6lh4/whatsapp-cloud-api).

The dashboard's temporary access token expires after 24 hours. For regular use, create a system user token with access to your app and WhatsApp account, including `whatsapp_business_messaging` and `whatsapp_business_management`. Meta documents tokens and permissions in the same collection.

## 2. Approve the Arabic invitation template

In WhatsApp Manager, create a template named exactly `classroom_invitation`, language **Arabic (`ar`)**, with a text body and these four positional parameters:

| Parameter | App value |
| --- | --- |
| `{{1}}` | Student name |
| `{{2}}` | Group name |
| `{{3}}` | Lesson title |
| `{{4}}` | Student's complete private invitation URL |

Suggested body:

```text
مرحباً ولي أمر {{1}}، بدأت الحصة المباشرة لمجموعة {{2}} بعنوان {{3}}. رابط دخول الطالب الخاص: {{4}}. يرجى استخدام الرابط للانضمام إلى الحصة.
```

Use fictional names and a sample HTTPS link for Meta's required examples. This app supplies body parameters only, so keep this template free of parameterized headers and buttons. Wait for Meta to approve the template. [Meta's template example](https://www.postman.com/meta/whatsapp-business-platform/request/ep5w4rc/create-template-w-document-header-text-body-a-phone-number-button-and-a-url-button) describes the parameter/example format.

The [API-ready template draft](./whatsapp-classroom-template.json) contains the same Arabic body and four fictional examples. It proposes the `UTILITY` category for a lesson notification to already enrolled students; Meta makes the final category and approval decisions. Preparing this file does not create or approve a template in your Meta account.

For an authenticated API submission, send this JSON to `POST https://graph.facebook.com/{version}/{WABA-ID}/message_templates`, using your supported Graph API version and WhatsApp Business Account ID. Template creation uses the account ID; invitation delivery uses the phone number ID configured below.

## 3. Add the credentials locally

Edit the ignored `.env.local` file. Fill these existing fields, or add them if missing:

```dotenv
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_GRAPH_VERSION=
WHATSAPP_BUSINESS_ACCOUNT_ID=
```

Use the **phone number ID**, rather than the account ID or the phone number itself. Use the supported Graph API version shown in your Meta dashboard. Keep the token in `.env.local`; do not paste it into chat or commit it.

In your Meta app, open **WhatsApp → API Setup** and copy the value labeled **Phone number ID** below the sending phone. Do not use the App ID from the app's basic settings or the Facebook user ID returned by Graph Explorer's `/me` request. Copy **WhatsApp Business Account ID** from the same WhatsApp setup page into `WHATSAPP_BUSINESS_ACCOUNT_ID`.

If you already saved these fields in the ignored `.env` file, remove any blank assignments for the same fields from `.env.local`. Next.js gives `.env.local` priority, so even an empty assignment hides the value in `.env`. Keep each credential in one active configuration file.

### Recover an expired access token

Meta error `190` means the access token is invalid; subcode `463` identifies an expired token. On October 6, 2026, the read-only setup check returned HTTP `401`, code `190`, subcode `463` for this workspace. The active WhatsApp credentials are in `.env`, with no WhatsApp overrides in `.env.local`. Renew the token in your Meta app's **WhatsApp → API Setup** and replace only `WHATSAPP_ACCESS_TOKEN` in the active file. Save it locally; do not paste it into chat. The application has no page for editing the token.

The user subsequently renewed the token. The later read-only check on the same date successfully verified the sender/account relationship and found Arabic `classroom_invitation` compatible but `PENDING`, with `ready: false`. The user's retry also reached the app's pending-template guard. Token renewal resolved the authorization error; Meta still needs to approve the invitation template before automatic sending can proceed.

On October 8, 2026, a new read-only check again returned HTTP `401`, code `190`, subcode `463`. The effective credentials still came from `.env`, with no WhatsApp overrides in `.env.local`, duplicate assignments, or surrounding whitespace. A fresh token is required; restarting alone cannot renew it. The setup command now identifies this as `EXPIRED_ACCESS_TOKEN` (other code `190` failures are `INVALID_ACCESS_TOKEN`) and prints fixed recovery instructions without exposing Meta's error text or credentials. It stops before template submission or message delivery.

After the user saved a fresh token locally on the same date, `npm run whatsapp:setup` succeeded and found the Arabic `classroom_invitation` template `APPROVED`, `compatible: true`, and `ready: true`. The development server on port 3000 reported reloading `.env` and returned HTTP `200`. No student messages were sent during these checks. Actual delivery still requires valid recipient numbers and, for the test sender, Meta's recipient verification.

For regular use, choose a system user token with access to your app and WhatsApp account and both WhatsApp permissions described above. A temporary dashboard token expires after 24 hours; generating another temporary token restores access only until that token expires. See [Meta's access-token documentation](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api?entity=request-13382743-06605a2c-2b74-4d0a-a035-2c227eae61d1).

After saving, run `npm run whatsapp:setup` again. Confirm that the token is accepted and that `classroom_invitation` is `APPROVED` with `ready: true`; token renewal alone does not approve the template or verify test recipients. Restart the running server to load the new credentials. For `npm run dev`, stop that terminal with Ctrl+C and run `npm run dev` again. For the public preview, use the preview restart commands below. Then retry the classroom invitation button; failed attempts can be retried, and sent invitations remain deduplicated.

The access token needs both `whatsapp_business_messaging` and `whatsapp_business_management` for the setup check. Messaging permission authorizes message requests; management permission enables inspection of the account's phone numbers and templates. Meta error `100` during verification can also mean an incorrect object ID. Generate a token with both permissions, verify both IDs against the WhatsApp setup page, save them locally, and rerun the check.

`WHATSAPP_BUSINESS_ACCOUNT_ID` is the WhatsApp Business Account ID shown in Meta's API setup page. The setup command uses it to check that the sending phone belongs to this account and to find or submit the classroom template. The application's message sender uses the first three fields.

After filling the four fields, check the account and template:

```powershell
npm run whatsapp:setup
```

To submit the prepared Arabic template when it does not already exist:

```powershell
npm run whatsapp:setup -- --submit
```

Submission creates a template for Meta to review; it does not guarantee approval. Existing templates are checked and preserved. Run the default check again to see whether Meta has approved the template. These commands do not send student messages.

The public preview launcher sets `CLASSROOM_PUBLIC_URL` to its actual HTTPS address. After changing credentials, restart the preview to load them:

```powershell
npm run public:stop
npm run public:start
```

A new tunnel has a new hostname. Copy or send fresh invitations after restarting. Keep the computer online during the lesson.

If an already-sent WhatsApp invitation points to a stopped tunnel, its message still contains the old hostname. Refresh the teacher classroom after the preview starts. For automatic WhatsApp delivery, click **رابط جديد** for each affected student, then **إرسال دعوات واتساب لكل طلاب المجموعة**. Renewing a link invalidates that student's old invitation and permits a fresh send; changing the hostname alone does not bypass send deduplication. Alternatively, **نسخ الدعوة** gives the current public link for manual sharing without rotating the student's token.

On October 8, 2026, the previous preview's server and tunnel were stopped, and its hostname no longer resolved. The launcher now allows 60 seconds for Windows process identification, preventing the observed 15-second startup timeout while retaining process ownership checks. After restarting, both tracked processes were running and an existing enrolled student's invitation redirected to the public classroom with a secure cookie; the classroom page and student API both returned HTTP `200`. No replacement WhatsApp messages were sent during recovery. Cloudflare Quick Tunnel hostnames change on restart and stop working when the tunnel stops; see [Cloudflare's Quick Tunnel documentation](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

## 4. Send invitations

When using Meta's test sending number, add each test recipient in the app's **WhatsApp → API Setup** page. Under **To**, open **Manage phone numbers** and add the student's WhatsApp number with its country code. The owner of that number must complete Meta's verification. For Egyptian numbers, `010…` becomes `+2010…`. Error `131030` indicates the recipient is absent from the test allowlist; correcting the sender ID or access token does not add recipients. Check that the Arabic invitation template is `APPROVED` before retrying. Test-recipient verification and template approval are separate setup steps.

Sign in as the teacher, open the classroom, and start the live camera. Click **إرسال دعوات واتساب لكل طلاب المجموعة**. The app shows progress and each student's result. Invalid or missing Egyptian student phone numbers are skipped. Successful sends are not repeated for the same invitation; failed sends can be retried.

Until the account and template are ready, use **نسخ الدعوة** beside each student and share that private link manually. Copying a link does not send a message.
