// paddle-api-service.js
const { Paddle, Environment } = require("@paddle/paddle-node-sdk");
const dotenv = require("dotenv");
dotenv.config();
class PaddleApiService {
  constructor() {
    this.initializePaddle();
    this.rateLimiter = new SimpleRateLimiter();
    this.criticalEndpoints = ['customers', 'subscriptions', 'transactions']; // Only these get hybrid treatment
  }

  initializePaddle() {
    const apiKey = process.env.PADDLE_SECRET_TOKEN;
    const environment = process.env.PADDLE_ENVIRONMENT || 'sandbox';
    
    if (!apiKey) {
      throw new Error('PADDLE_SECRET_TOKEN or PADDLE_API_KEY environment variable is required');
    }

    const isProduction = environment === 'production';
    const expectedPrefix = isProduction ? 'pdl_live_apikey_' : 'pdl_sdbx_api';
    
    if (!apiKey.startsWith(expectedPrefix)) {
      console.warn(`Warning: API key format may be incorrect. Expected prefix: ${expectedPrefix}`);
    }

    console.log(`Initializing Paddle SDK in ${environment} mode`);

    try {
      this.paddle = new Paddle(apiKey, {
        environment: isProduction ? Environment.production : Environment.sandbox,
      });
      console.log('Paddle SDK initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Paddle SDK:', error);
      throw error;
    }

    // Fallback API configuration
    this.apiConfig = {
      baseUrl: isProduction 
        ? 'https://api.paddle.com' 
        : 'https://sandbox-api.paddle.com',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      }
    };
  }


  async getSubscriptions(options = {}) {
    console.log('Fetching subscriptions (hybrid approach)...');
    try {
      const result = await this.rateLimiter.makeRequest(() => 
        this.paddle.subscriptions.list(options)
      );
      console.log(`SDK success: Found ${result.data?.length || 0} subscriptions`);
      return result;
    } catch (error) {
      console.warn(`SDK failed (${error.message}), using direct API...`);
      return await this.getSubscriptionsDirect(options);
    }
  }

  async getSubscriptionsDirect(options = {}) {
    const params = new URLSearchParams();
    
    if (options.status) {
      if (Array.isArray(options.status)) {
        options.status.forEach(status => params.append('status', status));
      } else {
        params.set('status', options.status);
      }
    }
    if (options.customerId) {
      if (Array.isArray(options.customerId)) {
        options.customerId.forEach(id => params.append('customer_id', id));
      } else {
        params.set('customer_id', options.customerId);
      }
    }
    if (options.updatedAfter) params.set('updated_after', options.updatedAfter);
    if (options.createdAfter) params.set('created_after', options.createdAfter);
    console.log(this.apiConfig.baseUrl, "baseUrl")
    const url = `${this.apiConfig.baseUrl}/subscriptions?${params.toString()}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: this.apiConfig.headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Direct API failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const result = await response.json();
    console.log(`Direct API success: Found ${result.data?.length || 0} subscriptions`);
    return result;
  }

  async getSubscription(subscriptionId) {
    console.log(`Fetching subscription ${subscriptionId} (hybrid approach)...`);
    try {
      return await this.rateLimiter.makeRequest(() => 
        this.paddle.subscriptions.get(subscriptionId)
      );
    } catch (error) {
      console.warn(`SDK failed (${error.message}), using direct API...`);
      const url = `${this.apiConfig.baseUrl}/subscriptions/${subscriptionId}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: this.apiConfig.headers,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Direct API failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const result = await response.json();
      return result.data; // Direct API wraps in data, SDK returns unwrapped
    }
  }

  async getCustomers(options = {}) {
    console.log('Fetching customers (hybrid approach)...');
    try {
      const result = await this.rateLimiter.makeRequest(() => 
        this.paddle.customers.list(options)
      );
      console.log(`SDK success: Found ${result.data?.length || 0} customers`);
      return result;
    } catch (error) {
      console.warn(`SDK failed (${error.message}), using direct API...`);
      return await this.getCustomersDirect(options);
    }
  }

  async getCustomersDirect(options = {}) {
    const params = new URLSearchParams();
    
    if (options.email) params.set('email', options.email);
    if (options.updatedAfter) params.set('updated_after', options.updatedAfter);
    if (options.createdAfter) params.set('created_after', options.createdAfter);
    if (options.perPage) params.set('per_page', options.perPage);

    const url = `${this.apiConfig.baseUrl}/customers?${params.toString()}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: this.apiConfig.headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Direct API failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const result = await response.json();
    console.log(`Direct API success: Found ${result.data?.length || 0} customers`);
    return result;
  }

  async getCustomer(customerId) {
    console.log(`Fetching customer ${customerId} (hybrid approach)...`);
    try {
      return await this.rateLimiter.makeRequest(() => 
        this.paddle.customers.get(customerId)
      );
    } catch (error) {
      console.warn(`SDK failed (${error.message}), using direct API...`);
      const url = `${this.apiConfig.baseUrl}/customers/${customerId}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: this.apiConfig.headers,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Direct API failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const result = await response.json();
      return result.data;
    }
  }

  async getTransactions(options = {}) {
    console.log('Fetching transactions (hybrid approach)...');
    try {
      const result = await this.rateLimiter.makeRequest(() => 
        this.paddle.transactions.list(options)
      );
      console.log(`SDK success: Found ${result.data?.length || 0} transactions`);
      return result;
    } catch (error) {
      console.warn(`SDK failed (${error.message}), using direct API...`);
      return await this.getTransactionsDirect(options);
    }
  }

  async getTransactionsDirect(options = {}) {
    const params = new URLSearchParams();
    
    if (options.status) {
      if (Array.isArray(options.status)) {
        options.status.forEach(status => params.append('status', status));
      } else {
        params.set('status', options.status);
      }
    }
    if (options.customerId) {
      if (Array.isArray(options.customerId)) {
        options.customerId.forEach(id => params.append('customer_id', id));
      } else {
        params.set('customer_id', options.customerId);
      }
    }
    if (options.createdAfter) params.set('created_after', options.createdAfter);
    if (options.updatedAfter) params.set('updated_after', options.updatedAfter);

    const url = `${this.apiConfig.baseUrl}/transactions?${params.toString()}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: this.apiConfig.headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Direct API failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const result = await response.json();
    console.log(`Direct API success: Found ${result.data?.length || 0} transactions`);
    return result;
  }

  // =============================================================================
  // ZERO-SUBSCRIPTION DETECTION (Critical for disaster recovery)
  // =============================================================================

  async hasAnyActiveSubscriptions() {
    try {
      console.log('Checking for ANY active subscriptions...');
      const result = await this.getSubscriptions({ 
        status: ['active', 'trialing'],
        // Just get 1 result to check if any exist
      });
      
      const count = result.data?.length || 0;
      console.log(`Active subscriptions check: ${count} found`);
      
      return {
        hasSubscriptions: count > 0,
        count: count,
        subscriptions: result.data || []
      };
    } catch (error) {
      console.error('Failed to check for active subscriptions:', error);
      return {
        hasSubscriptions: false,
        count: 0,
        subscriptions: [],
        error: error.message
      };
    }
  }

  async emergencySubscriptionScan() {
    console.log('🚨 EMERGENCY: Scanning ALL subscription statuses...');
    
    const allStatuses = ['active'];
    const results = {};
    
    for (const status of allStatuses) {
      try {
        const result = await this.getSubscriptions({ status: status });
        results[status] = {
          count: result.data?.length || 0,
          subscriptions: result.data || []
        };
        console.log(`${status}: ${results[status].count} subscriptions`);
      } catch (error) {
        console.error(`Failed to get ${status} subscriptions:`, error.message);
        results[status] = { count: 0, subscriptions: [], error: error.message };
      }
    }
    
    const totalCount = Object.values(results).reduce((sum, r) => sum + r.count, 0);
    console.log(`Total subscriptions found across all statuses: ${totalCount}`);
    
    return {
      totalCount,
      byStatus: results,
      isEmpty: totalCount === 0
    };
  }

  // =============================================================================
  // STANDARD SDK METHODS (for non-critical operations)
  // =============================================================================

  // For everything else, just use the SDK directly since it works fine
  async createCheckout(data) {
    return await this.rateLimiter.makeRequest(() => 
      this.paddle.checkouts.create(data)
    );
  }

  async getProducts(options = {}) {
    return await this.rateLimiter.makeRequest(() => 
      this.paddle.products.list(options)
    );
  }

  async getPrices(options = {}) {
    return await this.rateLimiter.makeRequest(() => 
      this.paddle.prices.list(options)
    );
  }

  async getWebhooks(options = {}) {
    return await this.rateLimiter.makeRequest(() => 
      this.paddle.webhooks.list(options)
    );
  }

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  async testConnection() {
    try {
      console.log('Testing Paddle API connection...');
      
      // Test with the most basic call
      const result = await this.getCustomers({ perPage: 1 });
      
      console.log('Connection test successful');
      return { 
        success: true, 
        environment: process.env.PADDLE_ENVIRONMENT || 'sandbox',
        customerCount: result.data?.length || 0
      };
    } catch (error) {
      console.error('Connection test failed:', error);
      return { success: false, error: error.message };
    }
  }

  // Quick diagnostic for disaster recovery
  async diagnosticScan() {
    console.log('🔍 Running diagnostic scan...');
    
    const results = {
      connection: await this.testConnection(),
      subscriptions: await this.hasAnyActiveSubscriptions(),
      customers: null,
      transactions: null
    };

    try {
      const customerResult = await this.getCustomers({ perPage: 5 });
      results.customers = {
        success: true,
        count: customerResult.data?.length || 0
      };
    } catch (error) {
      results.customers = {
        success: false,
        error: error.message
      };
    }

    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const transactionResult = await this.getTransactions({
        createdAfter: oneDayAgo.toISOString(),
        status: ['completed', 'paid']
      });
      results.transactions = {
        success: true,
        count: transactionResult.data?.length || 0
      };
    } catch (error) {
      results.transactions = {
        success: false,
        error: error.message
      };
    }

    // Determine if we need emergency mode
    const needsEmergency = !results.subscriptions.hasSubscriptions && 
                          results.connection.success;

    console.log('Diagnostic Summary:');
    console.log(`- Connection: ${results.connection.success ? 'OK' : 'FAILED'}`);
    console.log(`- Active Subscriptions: ${results.subscriptions.count || 0}`);
    console.log(`- Recent Customers: ${results.customers?.count || 0}`);
    console.log(`- Recent Transactions: ${results.transactions?.count || 0}`);
    console.log(`- Needs Emergency Mode: ${needsEmergency ? 'YES' : 'NO'}`);

    return {
      ...results,
      needsEmergencyMode: needsEmergency,
      summary: {
        hasData: results.subscriptions.hasSubscriptions || 
                results.customers?.count > 0 || 
                results.transactions?.count > 0,
        environment: process.env.PADDLE_ENVIRONMENT || 'sandbox'
      }
    };
  }
}

// Rate limiter (same implementation)
class SimpleRateLimiter {
  constructor(maxRequests = 100, windowMs = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = [];
  }

  async waitForSlot() {
    const now = Date.now();
    this.requests = this.requests.filter(time => now - time < this.windowMs);
    
    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = Math.min(...this.requests);
      const waitTime = this.windowMs - (now - oldestRequest) + 100;
      console.log(`Rate limit hit, waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return this.waitForSlot();
    }
    
    this.requests.push(now);
  }

  async makeRequest(requestFn) {
    await this.waitForSlot();
    try {
      return await requestFn();
    } catch (error) {
      if (error.message?.includes('rate limit') || error.message?.includes('429')) {
        console.warn('API rate limit error, backing off');
        await new Promise(resolve => setTimeout(resolve, 2000));
        return this.makeRequest(requestFn);
      }
      throw error;
    }
  }
}

module.exports = PaddleApiService;