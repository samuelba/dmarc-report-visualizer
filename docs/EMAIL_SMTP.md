# SMTP Email Service

The SMTP Email Service enables the application to send emails such as user invitation links. Administrators can configure SMTP settings through the admin interface.

## Setup

1. **Add to Environment Variables**

   Add the encryption key to your `.env` file:
   ```bash
   SMTP_ENCRYPTION_KEY=your-generated-key-here
   ```

2. **Configure SMTP Settings**

   After starting the application, log in as an administrator and navigate to Settings → SMTP Configuration to configure your SMTP server.

3. **Enable and Configure Redis**

   Enable and configure Redis in your `.env` file:
   ```bash
   REDIS_HOST=localhost
   REDIS_PORT=6379
   REDIS_PASSWORD=your-password-here
   ```

## Configuration Options

| Field | Description | Required |
|-------|-------------|----------|
| Host | SMTP server hostname | Yes |
| Port | SMTP server port (default: 587 for STARTTLS, 465 for TLS) | Yes |
| Security Mode | Encryption method: `none`, `ssl/tls`, or `starttls` | Yes |
| Username | SMTP authentication username | No* |
| Password | SMTP authentication password | No* |
| From Email | Email address to send from | Yes |
| From Name | Display name for sender | Yes |
| Reply-To | Optional reply-to email address | No |

*Authentication is optional for SMTP servers that don't require it

## Testing Configuration

Use the "Send Test Email" feature in the SMTP settings to verify your configuration:

1. Enter a recipient email address
2. Click "Send Test Email"
3. Check the recipient inbox for the test message
4. Review diagnostic information if the test fails

## Troubleshooting

### Connection Timeout
- **Symptom**: "Connection timeout" error after 10 seconds
- **Solutions**:
  - Verify the SMTP host and port are correct
  - Check firewall rules allow outbound connections to the SMTP port
  - Ensure the SMTP server is accessible from your network

### Authentication Failed
- **Symptom**: "Authentication failed" or "Invalid credentials" error
- **Solutions**:
  - Verify username and password are correct
  - For Gmail, ensure you're using an App Password, not your regular password
  - Check if your SMTP provider requires specific authentication methods
  - Verify your account has SMTP access enabled

### TLS/SSL Errors
- **Symptom**: "TLS handshake failed" or certificate errors
- **Solutions**:
  - Try switching between TLS and STARTTLS security modes
  - Verify the SMTP server supports the selected security mode
  - Check if your server's SSL certificates are valid

### Recipient Rejected
- **Symptom**: "Recipient rejected" or "Relay access denied"
- **Solutions**:
  - Verify the "From Email" is authorized to send through your SMTP server
  - Check SMTP server relay permissions
  - Ensure recipient email address is valid

### Rate Limiting
- **Symptom**: "Too many requests" or rate limit errors
- **Solutions**:
  - Check your SMTP provider's rate limits
  - Reduce the frequency of email sending
  - Consider upgrading your SMTP service plan

## Environment Variables

The following environment variable is required for SMTP functionality:

```bash
# Required: Encryption key for storing SMTP credentials
SMTP_ENCRYPTION_KEY=your-encryption-key-here
```

## Email Queue and Retry Logic

- **Invitation emails** are sent asynchronously through a queue
- Failed emails are automatically retried up to 3 times with exponential backoff (1s, 2s, 4s)
- **Test emails** are sent synchronously for immediate feedback
- All email operations include detailed diagnostic logging

## Security Considerations

- SMTP passwords are encrypted using AES-256-GCM before storage
- Passwords are never returned in API responses
- All SMTP configuration endpoints require administrator authentication
- Test email endpoint is rate-limited to prevent abuse (5 tests per minute per admin)
