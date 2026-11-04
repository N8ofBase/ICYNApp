# Crit Pass setup

The Crit Pass is a one-time $5 purchase. It lets a player host online duels and Starvos co-op games, and download the print-and-play PDFs. Joining a friend's game stays free, and so do guest play, Vs Computer and Pass & Play.

Nothing changes for players until you finish steps 1 to 7. `pass.js` hides the pass while `API` is empty, and `ws.mjs` only checks for a pass when `PASSES_TABLE` is set.

Do everything in **Stripe test mode** first. Switch to live keys only after a test purchase works from start to finish.

## 1. Stripe
1. Create a Stripe account, or sign in to yours.
2. Go to **Product catalog** and click **Add product**. Name it `Crit Pass` with a price of **$5.00, one-time**. Copy the **Price ID**, which starts with `price_`.
3. Go to **Developers**, then **API keys**, and copy the **Secret key**, which starts with `sk_test_`.

## 2. S3 bucket for the PDFs
1. Create a bucket, for example `icyn-print-and-play`, in us-east-1. Keep **Block all public access** turned on.
2. Upload these two files into a folder named `print-and-play/`:
   - `ICYN-Print-and-Play-Rulebook.pdf`
   - `ICYN-Hero-and-Starvos-Sheets.pdf`

## 3. DynamoDB table
Create the table `icyn-passes` with the partition key `userId` (String). On-demand capacity is fine.

## 4. The pass Lambda
1. Create a function named `icyn-pass` with the **Node.js 20.x** runtime. Paste in `online/pass.mjs`, name the file `index.mjs`, and set the handler to `index.handler`.
2. Add these environment variables:

   | Key | Value |
   |---|---|
   | `STRIPE_SECRET_KEY` | the key from step 1 |
   | `STRIPE_PRICE_ID` | the price ID from step 1 |
   | `STRIPE_WEBHOOK_SECRET` | from step 5 (fill it in after step 5) |
   | `PASSES_TABLE` | `icyn-passes` |
   | `FILES_BUCKET` | `icyn-print-and-play` |
   | `SITE_URL` | `https://icyn.prismcortex.net` |

3. Give the function role permission to use the table and read the PDFs:
   ```json
   {"Version":"2012-10-17","Statement":[
     {"Effect":"Allow","Action":["dynamodb:GetItem","dynamodb:PutItem"],"Resource":"arn:aws:dynamodb:us-east-1:*:table/icyn-passes"},
     {"Effect":"Allow","Action":"s3:GetObject","Resource":"arn:aws:s3:::icyn-print-and-play/print-and-play/*"}]}
   ```
4. Go to **Configuration**, then **Function URL**, and click **Create**:
   - Set **Auth type** to **NONE**. The function checks each player's sign-in itself.
   - Turn on **CORS**. Set the allowed origins to `https://icyn.prismcortex.net` and your Amplify test domain, the allowed methods to `GET, POST`, and the allowed headers to `authorization, content-type`.
   - Copy the URL. It looks like `https://abc123.lambda-url.us-east-1.on.aws`.

## 5. Stripe webhook
1. In Stripe, go to **Developers**, then **Webhooks**, and click **Add endpoint**.
2. Set the endpoint URL to `<function URL>/pass/webhook`.
3. Choose the event `checkout.session.completed`.
4. Copy the **Signing secret**, which starts with `whsec_`, into `STRIPE_WEBHOOK_SECRET` from step 4.

## 6. Turn on the check in the online arena
On the existing WebSocket Lambda:
1. Upload the new `online/ws.mjs`.
2. Add the environment variable `PASSES_TABLE` = `icyn-passes`.
3. Allow `dynamodb:GetItem` on `icyn-passes` in its role.

## 7. Connect the game
Put the function URL into `API` at the top of `pass.js` and push, or send the URL to Claude to do it.

## Test it
1. Sign in to the game, open **Crit Pass**, and buy the pass with Stripe's test card `4242 4242 4242 4242`. Any future expiry date and any CVC work.
2. When you return to the game you should see "Thank you!" and two download buttons.
3. Use a second account with no pass and try **Create online duel**. It should offer the Crit Pass. **Join** with a code should still work.
4. When everything works, repeat steps 1 and 5 with live keys and a live webhook, then update the environment variables.

## Give someone a pass for free
In the `icyn-passes` table, add an item with `userId` = the player's Cognito `sub` and `active` = `true`. To take a pass away, set `active` to `false`.

## Refunds
Refund the payment in Stripe, then set `active` to `false` on that player's row.
