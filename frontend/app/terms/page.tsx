"use client";
import React from 'react';
import './privacy.css'; // Create this CSS file

export default function PrivacyPolicyPage() {
  return (
    <div className="privacy-container">
      <h1>Privacy Policy & Terms of Service</h1>
      <p><strong>Effective Date:</strong> Aug 29, 2025</p>
      <p><strong>Last Updated:</strong> Aug 29, 2025</p>

      <section>
        <h2>1. Information We Collect</h2>
        <h3>1.1 Personal Information</h3>
        <ul>
          <li><strong>Account Information:</strong> Name, email address, username, password (encrypted)</li>
          <li><strong>Billing Information:</strong> Credit card details, billing address, transaction history</li>
          <li><strong>Profile Data:</strong> Learning preferences, progress tracking, custom settings</li>
        </ul>
        
        <h3>1.2 Technical Data</h3>
        <ul>
          <li><strong>Device Information:</strong> IP address, browser type, operating system, device identifiers</li>
          <li><strong>Usage Analytics:</strong> Pages visited, time spent, feature interactions, error logs</li>
          <li><strong>Cookies & Tracking:</strong> Session cookies, preference cookies, analytics cookies</li>
        </ul>

        <h3>1.3 Communication Data</h3>
        <ul>
          <li><strong>Support Communications:</strong> Chat messages, support tickets, feedback submissions</li>
          <li><strong>AI Interactions:</strong> Prompts, responses, conversation history (anonymized for improvement)</li>
        </ul>
      </section>

      <section>
        <h2>2. How We Use Your Data</h2>
        <ul>
          <li><strong>Service Delivery:</strong> Provide AI-based learning services and maintain platform functionality</li>
          <li><strong>Personalization:</strong> Customize learning experiences, recommend content, track progress</li>
          <li><strong>Communication:</strong> Send service updates, educational content, support responses</li>
          <li><strong>Payment Processing:</strong> Process transactions, manage credits, generate invoices</li>
          <li><strong>Security & Compliance:</strong> Detect fraud, prevent abuse, comply with legal obligations</li>
          <li><strong>Analytics & Improvement:</strong> Analyze usage patterns, improve AI models, enhance user experience</li>
        </ul>
      </section>

      <section>
        <h2>3. Data Sharing & Third Parties</h2>
        <p>We <strong>do not sell, rent, or trade</strong> your personal data. We may share information only with:</p>
        <ul>
          <li><strong>Service Providers:</strong> Payment processors (Stripe, PayPal), analytics tools (Google Analytics), cloud hosting (AWS, Vercel)</li>
          <li><strong>Legal Compliance:</strong> When required by law, court orders, or regulatory authorities</li>
          <li><strong>Business Transfers:</strong> In case of merger, acquisition, or sale of assets (with notice)</li>
          <li><strong>Consent-Based:</strong> When you explicitly authorize sharing for specific purposes</li>
        </ul>
      </section>

      <section>
        <h2>4. Refund Policy</h2>
        <h3>4.1 Full Refund Eligibility</h3>
        <ul>
          <li><strong>Zero Token Usage:</strong> Full refund if no credits/tokens have been used within 20 days of purchase</li>
          <li><strong>Technical Issues:</strong> Full refund for service outages or technical problems preventing usage</li>
          <li><strong>Unauthorized Charges:</strong> Immediate refund for charges not authorized by account holder</li>
        </ul>

        <h3>4.2 Partial Refund Policy</h3>
        <ul>
          <li><strong>Minimal Usage:</strong> Partial refund for accounts with less than 10% credit usage within 14 days</li>
          <li><strong>Service Dissatisfaction:</strong> Case-by-case review for legitimate service quality concerns</li>
        </ul>

        <h3>4.3 Refund Process</h3>
        <ul>
          <li><strong>Request Timeline:</strong> Refund requests must be submitted within 20 days of purchase</li>
          <li><strong>Processing Time:</strong> Refunds processed within 5-10 business days after approval</li>
          <li><strong>Contact Method:</strong> Submit refund requests to khadkasuman0000@gmail.com with order details</li>
        </ul>

        <h3>4.4 Non-Refundable Items</h3>
        <ul>
          <li>Credits used for AI interactions or content generation</li>
          <li>Premium features accessed or downloaded content</li>
          <li>Purchases older than 20 days</li>
        </ul>
      </section>

      <section>
        <h2>5. Your Data Rights</h2>
        <h3>5.1 Access & Portability</h3>
        <ul>
          <li>Request a copy of all personal data we hold about you</li>
          <li>Export your learning progress and conversation history</li>
        </ul>

        <h3>5.2 Correction & Deletion</h3>
        <ul>
          <li>Update or correct inaccurate personal information</li>
          <li>Request deletion of your account and associated data</li>
          <li>Withdraw consent for data processing activities</li>
        </ul>

        <h3>5.3 Marketing & Communications</h3>
        <ul>
          <li>Opt-out of marketing emails and promotional communications</li>
          <li>Manage notification preferences in account settings</li>
        </ul>
      </section>

      <section>
        <h2>6. Cookies & Tracking Technologies</h2>
        <h3>6.1 Essential Cookies</h3>
        <p>Required for basic site functionality, user authentication, and security.</p>
        
        <h3>6.2 Analytics Cookies</h3>
        <p>Help us understand user behavior and improve our services (Google Analytics, Mixpanel).</p>
        
        <h3>6.3 Cookie Management</h3>
        <p>You can manage cookie preferences through your browser settings or our cookie consent banner.</p>
      </section>

      <section>
        <h2>7. Data Security & Protection</h2>
        <ul>
          <li><strong>Encryption:</strong> All data transmitted using SSL/TLS encryption</li>
          <li><strong>Access Controls:</strong> Role-based access with multi-factor authentication</li>
          <li><strong>Regular Audits:</strong> Security assessments and penetration testing</li>
          <li><strong>Incident Response:</strong> Immediate notification of any data breaches</li>
        </ul>
        <p><em>Note: While we implement industry-standard security measures, no system is 100% secure.</em></p>
      </section>

      <section>
        <h2>8. Data Retention</h2>
        <ul>
          <li><strong>Account Data:</strong> Retained while account is active plus 2 years after deletion</li>
          <li><strong>Payment Data:</strong> Kept for 7 years for tax and legal compliance</li>
          <li><strong>Analytics Data:</strong> Anonymized data retained for 3 years for service improvement</li>
          <li><strong>Support Communications:</strong> Retained for 3 years for quality assurance</li>
        </ul>
      </section>

      <section>
        <h2>9. International Data Transfers</h2>
        <p>
          Your data may be processed in countries outside your residence. We ensure adequate 
          protection through standard contractual clauses and certified data processing agreements.
        </p>
      </section>

      <section>
        <h2>10. Children Privacy</h2>
        <p>
          Our services are not intended for children under 13. We do not knowingly collect 
          personal information from children. If we become aware of such collection, we will 
          delete the information immediately.
        </p>
      </section>

      <section>
        <h2>11. Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy to reflect changes in our practices or legal requirements. 
          Material changes will be communicated via email or prominent notice on our platform. 
          Continued use after changes constitutes acceptance of the updated policy.
        </p>
      </section>

      <section>
        <h2>12. Governing Law</h2>
        <p>
          This Privacy Policy is governed by the laws of nepal. Any disputes will be 
          resolved through binding arbitration or in the courts of nepal.
        </p>
      </section>

      <section>
        <h2>13. Contact Information</h2>
        <div className="contact-info">
          <p><strong>Data Protection Officer:</strong> khadkasuman0000@gmail.com</p>
          <p><strong>General Inquiries:</strong> khadkasuman0000@gmail.com</p>
          <p><strong>Refund Requests:</strong> khadkasuman0000@gmail.com</p>
          <p><strong>Response Time:</strong> We aim to respond within 48 hours</p>
        </div>
      </section>

      <footer className="policy-footer">
        <p><em>This policy was last reviewed and updated on January 1, 2025.</em></p>
        <p><em>© 2025 Curiositylab. All rights reserved.</em></p>
      </footer>
    </div>
  );
}