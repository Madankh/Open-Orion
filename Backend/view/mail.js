exports.generatePaymentEmailHTML = function(paymentData) {
  const {
    success,
    price,
    currency,
    quantity,
    interval,
    customerEmail,
    orderNumber,
    serviceName
  } = paymentData;

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Payment Status</title>
      </head>
      <body style="margin: 0; padding: 0; color: #ffffff; font-family: 'Gill Sans', 'Gill Sans MT', Calibri, 'Trebuchet MS', sans-serif; background-color: #064e3b;">
        <table width="100%" cellpadding="0" cellspacing="0" style="min-height: 100vh;">
          <tr>
            <td align="center" style="padding: 1rem;">
              <table width="500" cellpadding="0" cellspacing="0" style="background-color: #065f46; border-radius: 12px; padding: 2rem;">
                <tr>
                  <td align="center">
                    <h2 style="text-align: center; padding: 10px; width: 80%; margin-bottom: 0;">
                      ${success ? 'Payment Successful!' : 'Payment Failed'}
                    </h2>
                    
                    <h3 style="margin: 1rem 0;">Thank you for your purchase!</h3>
                    
                    <table width="80%" cellpadding="0" cellspacing="0" style="background-color: rgba(255, 255, 255, 0.1); padding: 1.5rem; border-radius: 8px; margin: 1rem 0; max-width: 400px;">
                      ${serviceName ? `
                        <tr>
                          <td style="padding: 0.5rem 0;">
                            <span style="color: rgba(255, 255, 255, 0.7); font-size: 0.9rem;">Service:</span><br/>
                            ${serviceName}
                          </td>
                        </tr>
                      ` : ''}
                      
                      <tr>
                        <td style="padding: 0.5rem 0;">
                          <span style="color: rgba(255, 255, 255, 0.7); font-size: 0.9rem;">Amount:</span><br/>
                          $${price}
                        </td>
                      </tr>
                      
                      <tr>
                        <td style="padding: 0.5rem 0;">
                          <span style="color: rgba(255, 255, 255, 0.7); font-size: 0.9rem;">Quantity:</span><br/>
                          ${quantity}
                        </td>
                      </tr>
                      
                      <tr>
                        <td style="padding: 0.5rem 0;">
                          <span style="color: rgba(255, 255, 255, 0.7); font-size: 0.9rem;">Billing Interval:</span><br/>
                          ${interval}
                        </td>
                      </tr>
                      
                      ${orderNumber ? `
                        <tr>
                          <td style="padding: 0.5rem 0;">
                            <span style="color: rgba(255, 255, 255, 0.7); font-size: 0.9rem;">Report:</span><br/>
                            ${orderNumber}
                          </td>
                        </tr>
                      ` : ''}
                    </table>
                    
                    ${customerEmail ? `
                      <p style="margin-top: 1rem; font-size: 0.9rem;">
                        A confirmation email has been sent to ${customerEmail}
                      </p>
                    ` : ''}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
};

exports.generatePaymentFailedEmailHTML = function(customerEmail) {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Payment Failed</title>
      </head>
      <body style="margin: 0; padding: 0; color: #ffffff; font-family: 'Gill Sans', 'Gill Sans MT', Calibri, 'Trebuchet MS', sans-serif; background-color: #7f1d1d;">
        <table width="100%" cellpadding="0" cellspacing="0" style="min-height: 100vh;">
          <tr>
            <td align="center" style="padding: 1rem;">
              <table width="500" cellpadding="0" cellspacing="0" style="background-color: #991b1b; border-radius: 12px; padding: 2rem;">
                <tr>
                  <td align="center">
                    <h2 style="text-align: center; padding: 10px; width: 80%; margin-bottom: 0;">
                      Payment Failed
                    </h2>
                    
                    <h3 style="margin: 1rem 0;">We couldn't process your payment</h3>
                    
                    <div style="background-color: rgba(255, 255, 255, 0.1); padding: 1.5rem; border-radius: 8px; margin: 1rem 0; max-width: 400px;">
                      <p style="margin: 0 0 1rem 0; line-height: 1.6;">
                        Your recent payment attempt was unsuccessful. This could be due to:
                      </p>
                      <ul style="text-align: left; margin: 0; padding-left: 1.5rem; line-height: 1.6;">
                        <li>Insufficient funds</li>
                        <li>Expired or invalid card details</li>
                        <li>Bank security restrictions</li>
                        <li>Network connectivity issues</li>
                      </ul>
                    </div>
                    
                    <div style="background-color: rgba(255, 255, 255, 0.1); padding: 1.5rem; border-radius: 8px; margin: 1rem 0; max-width: 400px;">
                      <h4 style="margin: 0 0 1rem 0; color: #fbbf24;">What to do next:</h4>
                      <p style="margin: 0; line-height: 1.6; text-align: left;">
                        1. Check your payment method details<br/>
                        2. Ensure sufficient funds are available<br/>
                        3. Contact your bank if needed<br/>
                        4. Try the payment again
                      </p>
                    </div>
                    
                    <p style="margin-top: 1.5rem; font-size: 0.9rem; color: rgba(255, 255, 255, 0.8);">
                      If you continue to experience issues, please contact our support team.
                    </p>
                    
                    ${customerEmail ? `
                      <p style="margin-top: 1rem; font-size: 0.9rem; color: rgba(255, 255, 255, 0.7);">
                        This notification was sent to ${customerEmail}
                      </p>
                    ` : ''}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
};


exports.generateSubscriptionCancelEmailHTML = function(customerEmail, subscriptionEndDate = null) {
  const endDateText = subscriptionEndDate ? 
    `Your subscription will remain active until ${new Date(subscriptionEndDate).toLocaleDateString()}.` :
    'Will not renew.';
    
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Subscription Cancelled</title>
      </head>
      <body style="margin: 0; padding: 0; color: #ffffff; font-family: 'Gill Sans', 'Gill Sans MT', Calibri, 'Trebuchet MS', sans-serif; background-color: #374151;">
        <table width="100%" cellpadding="0" cellspacing="0" style="min-height: 100vh;">
          <tr>
            <td align="center" style="padding: 1rem;">
              <table width="500" cellpadding="0" cellspacing="0" style="background-color: #4b5563; border-radius: 12px; padding: 2rem;">
                <tr>
                  <td align="center">
                    <h2 style="text-align: center; padding: 10px; width: 80%; margin-bottom: 0;">
                      Subscription Cancelled
                    </h2>
                    
                    <h3 style="margin: 1rem 0;">We're sorry to see you go</h3>
                    
                    <div style="background-color: rgba(255, 255, 255, 0.1); padding: 1.5rem; border-radius: 8px; margin: 1rem 0; max-width: 400px;">
                      <p style="margin: 0 0 1rem 0; line-height: 1.6;">
                        Your subscription has been successfully cancelled. ${endDateText}
                      </p>
                      <p style="margin: 0; line-height: 1.6; color: rgba(255, 255, 255, 0.8);">
                        You'll continue to have access to all features until your current billing period ends.
                      </p>
                    </div>
                    
                    <div style="background-color: rgba(255, 255, 255, 0.1); padding: 1.5rem; border-radius: 8px; margin: 1rem 0; max-width: 400px;">
                      <h4 style="margin: 0 0 1rem 0; color: #60a5fa;">What happens next:</h4>
                      <p style="margin: 0; line-height: 1.6; text-align: left;">
                        • No future charges will be made<br/>
                        • Your account remains active until expiration<br/>
                        • You can reactivate anytime before then<br/>
                        • All your data will be safely stored
                      </p>
                    </div>
                    
                    <div style="background-color: rgba(255, 255, 255, 0.05); padding: 1.5rem; border-radius: 8px; margin: 1rem 0; max-width: 400px;">
                      <p style="margin: 0 0 1rem 0; line-height: 1.6; font-size: 0.9rem;">
                        <strong>Changed your mind?</strong>
                      </p>
                      <p style="margin: 0; line-height: 1.6; font-size: 0.9rem; color: rgba(255, 255, 255, 0.8);">
                        You can easily reactivate your subscription from your account dashboard at any time.
                      </p>
                    </div>
                    
                    <p style="margin-top: 1.5rem; font-size: 0.9rem; color: rgba(255, 255, 255, 0.8);">
                      Thank you for being part of our community. We'd love to have you back anytime!
                    </p>
                    
                    ${customerEmail ? `
                      <p style="margin-top: 1rem; font-size: 0.9rem; color: rgba(255, 255, 255, 0.7);">
                        This confirmation was sent to ${customerEmail}
                      </p>
                    ` : ''}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
};
