# Infrastructure — Webhooks & External Integrations

## Rôle

Gestion des webhooks entrants (MobileWallet, SMS providers, etc.) et intégrations externes.

---

## Webhook Pattern

### Sécurisation

**Signature verification** (HMAC-SHA256)

```javascript
// routes/webhookRoutes.js
const crypto = require('crypto');

const verifySignature = (req, secret) => {
  const signature = req.headers['x-signature'];
  if (!signature) return false;
  
  const payload = JSON.stringify(req.body);
  const hash = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(hash)
  );
};

router.post('/webhook/mobilewallet', (req, res, next) => {
  if (!verifySignature(req, process.env.MOBILEWALLET_WEBHOOK_SECRET)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  next();
});
```

### Idempotence

```javascript
// Webhook handler
exports.mobilewalletWebhook = async (req, res) => {
  const { transactionId, externalId, status } = req.body;
  
  // Check already processed
  const existing = await repos.webhookLogs.getByExternalId(externalId);
  if (existing) {
    // Avoid duplicate processing
    return res.status(200).json({ message: 'Already processed' });
  }
  
  try {
    // Process webhook
    await paymentService.handlePaymentWebhook(req.body);
    
    // Log success
    await repos.webhookLogs.create({
      externalId,
      source: 'mobilewallet',
      status: 'success',
      payload: req.body
    });
    
    res.status(200).json({ success: true });
  } catch (error) {
    // Log failure
    await repos.webhookLogs.create({
      externalId,
      source: 'mobilewallet',
      status: 'error',
      error: error.message,
      payload: req.body
    });
    
    res.status(500).json({ error: error.message });
  }
};
```

---

## MobileWallet Webhook

### Endpoint

```
POST /webhook/mobilewallet
```

### Payload

```json
{
  "externalId": "tx-123456",
  "transactionId": "payment-xyz",
  "status": "completed",
  "amount": 15000,
  "timestamp": "2025-06-06T15:30:45Z",
  "signature": "hmac-sha256..."
}
```

### Handler

```javascript
// src/services/payment/paymentWebhookService.js
exports.handleMobilewalletWebhook = async (payload) => {
  const { externalId, transactionId, status } = payload;
  
  // Find payment
  const payment = await repos.payments.getByExternalId(externalId);
  if (!payment) {
    throw new Error(`Payment not found: ${externalId}`);
  }
  
  // Update payment status
  await repos.payments.update(payment.id, {
    status: status === 'completed' ? 'completed' : 'failed'
  });
  
  // Update order
  const order = await repos.orders.getById(payment.orderId);
  if (status === 'completed') {
    await repos.orders.update(order.id, { status: 'confirmed' });
    
    // Emit socket
    const io = require('../../socket').getIO();
    io.to(`user:${order.userId}`).emit('payment.settled', {
      paymentId: payment.id,
      status: 'success'
    });
  } else {
    io.to(`user:${order.userId}`).emit('payment.settled', {
      paymentId: payment.id,
      status: 'failed'
    });
  }
};
```

---

## SMS Provider Webhook (SMS verification)

### Endpoint

```
POST /webhook/sms
```

### Payload (Example: Twilio)

```json
{
  "MessageSid": "SM...",
  "AccountSid": "AC...",
  "From": "+221771234567",
  "Body": "Code: 123456",
  "DateSent": "2025-06-06T15:30:45Z"
}
```

### Handler

```javascript
// Check if SMS is 2FA code verification
if (req.body.Body.includes('Code:')) {
  const code = req.body.Body.match(/\d{6}/)[0];
  const phoneNumber = req.body.From;
  
  await verificationService.verify2FA(phoneNumber, code);
}
```

---

## Webhook Logging

### Log structure

```typescript
WebhookLog {
  id: string
  source: 'mobilewallet' | 'sms' | 'email' | ...
  externalId: string         // Provider's transaction ID
  status: 'success' | 'error'
  statusCode: number         // HTTP response code we sent
  payload: object            // Original payload
  error?: string             // Error message if failed
  
  retryCount: number         // Retry attempts
  lastRetry?: ISO8601
  
  createdAt: ISO8601
}
```

### Retry logic

```javascript
// If webhook failed, retry
const MAX_RETRIES = 3;
const RETRY_DELAY = 60000; // 1 minute

if (log.status === 'error' && log.retryCount < MAX_RETRIES) {
  setTimeout(async () => {
    try {
      await handleWebhook(log.payload);
      log.status = 'success';
      log.retryCount++;
      await repos.webhookLogs.update(log.id, log);
    } catch (error) {
      log.retryCount++;
      await repos.webhookLogs.update(log.id, log);
    }
  }, RETRY_DELAY);
}
```

---

## External API Calls (Outgoing)

### MobileWallet Call (Payment initiation)

```javascript
// src/services/payment/paymentService.js
const axios = require('axios');

exports.initiateMobilewalletPayment = async (amount, orderId) => {
  const payload = {
    apiKey: process.env.MOBILEWALLET_API_KEY,
    amount,
    currency: 'XOF',
    callbackUrl: `${process.env.API_URL}/webhook/mobilewallet`,
    externalId: orderId,
    description: `Order #${orderId}`
  };
  
  try {
    const response = await axios.post(
      `${process.env.MOBILEWALLET_URL}/api/transactions/create`,
      payload,
      { timeout: 10000 }  // 10s timeout
    );
    
    if (!response.data.success) {
      throw new Error(response.data.error);
    }
    
    return {
      externalTransactionId: response.data.transactionId,
      paymentNumber: response.data.paymentNumber
    };
  } catch (error) {
    console.error(`❌ MobileWallet API error: ${error.message}`);
    throw error;
  }
};
```

### Error handling

```javascript
// Retry with exponential backoff
const retry = async (fn, maxRetries = 3) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      const delay = Math.pow(2, i) * 1000;  // 1s, 2s, 4s
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

// Usage
const result = await retry(() => initiateMobilewalletPayment(15000, orderId));
```

---

## Webhook Replay & Debugging

### Dashboard (Future)

- View webhook logs
- Inspect payload
- Replay webhook manually

### CLI

```bash
# View recent webhooks
node scripts/webhooks.js list --source mobilewallet --limit 10

# Replay webhook
node scripts/webhooks.js replay <webhookId>

# Test signature
node scripts/webhooks.js verify-signature <payload> <signature> <secret>
```

---

## Checklist

Before going live:

- [ ] Webhook endpoints are `POST` (not GET)
- [ ] Signature verification is enabled
- [ ] Idempotence check (avoid duplicate processing)
- [ ] Error handling + retry logic
- [ ] Webhook logs are persisted
- [ ] Timeout set on external API calls (10-30s)
- [ ] Webhook secrets are in env vars (not hardcoded)
- [ ] Callback URLs are HTTPS (prod)
- [ ] Provider webhook is pointing to correct endpoint
