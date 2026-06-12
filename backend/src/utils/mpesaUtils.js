const crypto = require('crypto');

class MpesaUtils {
  formatPhoneNumber(phoneNumber) {
    // Remove any non-digit characters
    let cleaned = phoneNumber.toString().replace(/\D/g, '');
    
    // Remove leading 0 or +254
    if (cleaned.startsWith('0')) {
      cleaned = '254' + cleaned.substring(1);
    } else if (cleaned.startsWith('254')) {
      cleaned = cleaned;
    } else if (cleaned.startsWith('+')) {
      cleaned = cleaned.substring(1);
    } else if (cleaned.length === 9) {
      cleaned = '254' + cleaned;
    }
    
    return cleaned;
  }

  validateMpesaNumber(phoneNumber) {
    const formatted = this.formatPhoneNumber(phoneNumber);
    const regex = /^254[17][0-9]{8}$/;
    return regex.test(formatted);
  }

  formatAmount(amount) {
    return Math.round(parseFloat(amount)).toString();
  }

  generateCheckoutRequestID() {
    return `TIX_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  parseCallbackResponse(body) {
    try {
      // Decode from base64 if needed
      let data = body;
      if (body && body.Body && body.Body.stkCallback) {
        return body;
      }
      
      // Some callbacks come as JSON string
      if (typeof body === 'string') {
        data = JSON.parse(body);
      }
      
      return data;
    } catch (error) {
      console.error('Failed to parse callback:', error);
      return null;
    }
  }

  getResultCodeDescription(resultCode) {
    const codes = {
      '0': 'Success',
      '1': 'Insufficient funds',
      '2': 'Less than minimum transaction value',
      '3': 'More than maximum transaction value',
      '4': 'Would exceed daily transfer limit',
      '5': 'Would exceed minimum balance',
      '6': 'Unresolved balance on locker',
      '7': 'Would exceed daily transaction count limit',
      '8': 'Unresolved balance on locker',
      '9': 'Invalid account number',
      '10': 'Invalid transaction type',
      '11': 'Invalid amount',
      '12': 'Invalid reference number',
      '13': 'Invalid sender',
      '14': 'Invalid transaction date',
      '15': 'Invalid transaction ID',
      '16': 'Invalid credit card number',
      '17': 'Invalid CVV',
      '18': 'Invalid expiry date',
      '19': 'Invalid PIN',
      '20': 'Transaction declined',
      '21': 'Cancelled by customer',
      '22': 'Transaction reversed',
      '23': 'Transaction not completed',
      '1001': 'Transaction failed',
      '1002': 'Request cancelled by user',
      '1003': 'Request timeout',
      '1037': 'Transaction amount exceeds limit',
      '1032': 'Transaction failed - insufficient balance',
    };
    
    return codes[resultCode] || 'Unknown error';
  }

  isSuccessfulTransaction(resultCode) {
    return resultCode === '0' || resultCode === 0;
  }

  shouldRetryTransaction(resultCode) {
    const retryCodes = ['1001', '1002', '1003', '1032', '1037'];
    return retryCodes.includes(String(resultCode));
  }

  generateTransactionID() {
    return `MPESA_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
  }
   verifyCallbackSignature(body, signature, secret) {
    try {
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(body))
        .digest('base64');
      
      return signature === expectedSignature;
    } catch (error) {
      console.error('Signature verification failed:', error);
      return false;
    }
  }

  parseCallbackData(callbackData) {
    try {
      // Handle different callback formats
      let data = callbackData;
      
      if (typeof callbackData === 'string') {
        data = JSON.parse(callbackData);
      }
      
      // Extract the stkCallback object
      const stkCallback = data?.Body?.stkCallback;
      
      if (!stkCallback) {
        throw new Error('Invalid callback structure: missing stkCallback');
      }
      
      // Extract metadata from CallbackMetadata
      const metadata = {};
      if (stkCallback.CallbackMetadata?.Item) {
        for (const item of stkCallback.CallbackMetadata.Item) {
          metadata[item.Name] = item.Value;
        }
      }
      
      return {
        merchantRequestID: stkCallback.MerchantRequestID,
        checkoutRequestID: stkCallback.CheckoutRequestID,
        resultCode: parseInt(stkCallback.ResultCode),
        resultDesc: stkCallback.ResultDesc,
        amount: metadata.Amount,
        mpesaReceiptNumber: metadata.MpesaReceiptNumber,
        transactionDate: metadata.TransactionDate,
        phoneNumber: metadata.PhoneNumber,
        metadata,
        rawCallback: callbackData,
      };
    } catch (error) {
      console.error('Failed to parse callback:', error);
      return null;
    }
  }

  generateIdempotencyKey(transactionId) {
    return `mpesa_callback_${transactionId}_${Date.now()}`;
  }

  isDuplicateCallback(existingLog, newCallback) {
    if (!existingLog) return false;
    
    // Check if already processed successfully
    if (existingLog.status === 'completed') return true;
    
    // Check if same receipt number
    if (existingLog.mpesa_receipt_number && 
        newCallback.mpesaReceiptNumber === existingLog.mpesa_receipt_number) {
      return true;
    }
    
    return false;
  }

  getWebhookRetryDelay(attempt) {
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s, 64s
    return Math.min(Math.pow(2, attempt) * 1000, 64000);
  }

  shouldRetryWebhook(resultCode, attempt) {
    // Retry on specific error codes or if attempt < max
    const retryableCodes = [1001, 1002, 1003, 1032, 1037, 2001];
    return retryableCodes.includes(resultCode) && attempt < 5;
  }


}

module.exports = new MpesaUtils();