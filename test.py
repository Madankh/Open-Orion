class TokenDeductionCalculator:
    def __init__(self):
        """
        Simple calculator for token deductions
        Fixed pricing: $0.002 per credit (10,000 credits per $20)
        """
        self.credit_value = 0.002  # $0.002 per credit
        
        # Your API costs with profit margin (per million tokens)
        self.input_cost_per_million = 3.0 * 1.5    # $3 per million input tokens + 50% profit
        self.output_cost_per_million = 15.0 * 1.5  # $15 per million output tokens + 50% profit
        
        # Pre-calculated multipliers for efficiency
        self.input_multiplier = (self.input_cost_per_million / 1_000_000) / self.credit_value
        self.output_multiplier = (self.output_cost_per_million / 1_000_000) / self.credit_value
    
    def calculate_credits_to_deduct(self, token_info):
        """
        Calculate how many credits to deduct from user's balance
        
        Args:
            token_info: Dict with cumulative_input_tokens and cumulative_output_tokens
        
        Returns:
            Dict with breakdown of costs and credits to deduct
        """
        input_tokens = token_info.get('cumulative_input_tokens', 0)
        output_tokens = token_info.get('cumulative_output_tokens', 0)
        
        # Calculate actual costs (without profit margin for cost tracking)
        actual_input_cost = (input_tokens * 3.0) / 1_000_000  # Your real cost
        actual_output_cost = (output_tokens * 15.0) / 1_000_000  # Your real cost
        actual_total_cost = actual_input_cost + actual_output_cost
        
        # Calculate what you charge (with profit margin)
        charged_cost = (input_tokens * self.input_cost_per_million) / 1_000_000
        charged_cost += (output_tokens * self.output_cost_per_million) / 1_000_000
        
        # Calculate credits to deduct (simplified)
        input_credits_deduct = input_tokens * self.input_multiplier
        output_credits_deduct = output_tokens * self.output_multiplier
        total_credits_deduct = input_credits_deduct + output_credits_deduct
        
        # Calculate profit
        revenue = total_credits_deduct * self.credit_value
        profit = revenue - actual_total_cost
        profit_margin = (profit / revenue * 100) if revenue > 0 else 0
        
        return {
            'input_tokens_used': input_tokens,
            'output_tokens_used': output_tokens,
            'your_actual_cost': actual_total_cost,
            'revenue': revenue,
            'profit': profit,
            'profit_margin': profit_margin,
            'credits_to_deduct': round(total_credits_deduct, 2)
        }
    
    def deduct_credits(self, user_balance, token_info):
        """
        Deduct credits from user balance based on token usage
        
        Args:
            user_balance: User's current credit balance
            token_info: Token usage info from agent
        
        Returns:
            New balance and deduction amount
        """
        deduction_info = self.calculate_credits_to_deduct(token_info)
        credits_to_deduct = deduction_info['credits_to_deduct']
        
        new_balance = max(0, user_balance - credits_to_deduct)
        
        return {
            'old_balance': user_balance,
            'new_balance': new_balance,
            'credits_deducted': credits_to_deduct,
            'can_afford': user_balance >= credits_to_deduct
        }

# Simple usage example
def main():
    # Initialize calculator (no plan info needed)
    calculator = TokenDeductionCalculator()
    
    # Your token usage data
    token_info = {
        'cumulative_input_tokens': 21582, 
        'cumulative_output_tokens': 1068, 
        'cumulative_total_tokens': 22650
    }
    
    print("TOKEN DEDUCTION CALCULATION")
    print("="*40)
    
    # Calculate how many credits to deduct
    deduction_info = calculator.calculate_credits_to_deduct(token_info)
    
    print(f"Input tokens: {deduction_info['input_tokens_used']:,}")
    print(f"Output tokens: {deduction_info['output_tokens_used']:,}")
    print(f"Your actual cost: ${deduction_info['your_actual_cost']:.6f}")
    print(f"Revenue: ${deduction_info['revenue']:.6f}")
    print(f"Profit: ${deduction_info['profit']:.6f}")
    print(f"Profit margin: {deduction_info['profit_margin']:.1f}%")
    print(f"Credits to deduct: {deduction_info['credits_to_deduct']}")
    
    # Test with different user balances
    test_balances = [10000, 83000, 50000, 100]  # Different plan users
    
    print("\nDEDUCTION RESULTS:")
    print("-" * 30)
    
    for balance in test_balances:
        result = calculator.deduct_credits(balance, token_info)
        print(f"Balance {balance:,} → {result['new_balance']:.2f} "
              f"(deducted {result['credits_deducted']:.2f})")

if __name__ == "__main__":
    main()

# Quick function for your code integration
def deduct_user_credits(user_balance, token_info):
    """
    Simple function to deduct credits from user balance
    
    Args:
        user_balance: Current user credit balance
        token_info: Output from agent.get_token_info()
    
    Returns:
        New balance after deduction
    """
    calculator = TokenDeductionCalculator()
    result = calculator.deduct_credits(user_balance, token_info)
    return result['new_balance']