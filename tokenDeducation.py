from typing import Optional, Dict, Any, List
from dataclasses import dataclass
from enum import Enum
from Mongodb.db import DatabaseManager
from websocketUserToken import CreditAPIClient

@dataclass
class ModelPricing:
    """Data class to store model pricing information"""
    name: str
    input_cost_per_million: float  # Cost per million input tokens
    output_cost_per_million: float  # Cost per million output tokens
    
class ModelType(Enum):
    """Enum for supported models"""
    GPT_5_MINI = "openai/gpt-5-mini"
    MOONSHOTHINK = "moonshotai/kimi-k2-thinking"
    GPT_OSS = "openai/gpt-oss-120b"
    GPT_5_NANO = "openai/gpt-5-nano"
    KIMI_K2 = "moonshotai/kimi-k2-0905"
    O4_MINI_HIGH = "o4-mini-high"
    O1 = "openai/gpt-5.2"
    GLMFree = "z-ai/glm-4.5-air:free"
    GLM46 = "z-ai/glm-4.6"
    GLM4V = "z-ai/glm-4.6v"
    QWEN3= "qwen/qwen3-30b-a3b-thinking-2507"
    DEEPSEEK = "deepseek/deepseek-v3.2-speciale"
    Anthropic="anthropic/claude-sonnet-4.5"
    AnthropicOpus="anthropic/claude-opus-4.5"
    Google="google/gemini-3-pro-preview"
    Google_flash = "google/gemini-2.5-flash-lite"
    XAI="x-ai/grok-4"
    ZAI32B="z-ai/glm-4-32b"
    MISTRALAI = "mistralai/ministral-14b-2512"
    QWEN = "qwen/qwen3-vl-30b-a3b-instruct"
    GLM47="z-ai/glm-4.7"

class MultiModelTokenCalculator:
    def __init__(self,db_manager: DatabaseManager, profit_multiplier: float = 1.6):
        """
        Multi-model token deduction calculator
        
        Args:
            profit_multiplier: Multiplier for profit margin (default 1.5x)
        """
        self.credit_value = 0.002  # $0.002 per credit
        self.profit_multiplier = profit_multiplier
        self.db_manager=db_manager

        self.embedding_pricing = {
           'input_cost_per_million': 0.01,  
           'output_cost_per_million': 0.0, 
           'adjusted_input_cost': 0.01 * profit_multiplier, 
           'credits_per_token': (0.01 * profit_multiplier / 1_000_000) / self.credit_value
        }
        
        # Define model pricing (base costs before profit margin)
        self.model_pricing = {
            ModelType.GPT_5_MINI: ModelPricing(
                name="OpenAI GPT-5 Mini",
                input_cost_per_million=0.26,
                output_cost_per_million=2.2
            ),
            ModelType.O1: ModelPricing(
                name="OpenAI",
                input_cost_per_million=2,
                output_cost_per_million=15,
            ),
            ModelType.MOONSHOTHINK: ModelPricing(
                name="moonshotai/kimi-k2-thinking",
                input_cost_per_million=0.56,
                output_cost_per_million=2.56
            ),
            ModelType.GPT_OSS: ModelPricing(
                name="OpenAI GPT-OSS",
                input_cost_per_million=0.36,
                output_cost_per_million=1
            ),
            ModelType.GPT_5_NANO: ModelPricing(
                name="OpenAI GPT-5 Nano",
                input_cost_per_million=0.06,
                output_cost_per_million=0.40
            ),
            ModelType.KIMI_K2: ModelPricing(
                name="moonshotai/kimi-k2-0905",
                input_cost_per_million=0.70,
                output_cost_per_million=2.20
            ),
            ModelType.O4_MINI_HIGH: ModelPricing(
                name="OpenAI o4 Mini High",
                input_cost_per_million=1.12,
                output_cost_per_million=4.42
            ),
            ModelType.GLM46:ModelPricing(
                name="z-ai/glm-4.6",
                input_cost_per_million=0.68,
                output_cost_per_million=2.12
            ),
            ModelType.GLM47:ModelPricing(
                name="z-ai/glm-4.7",
                input_cost_per_million=0.70,
                output_cost_per_million=2.12
            ),
            ModelType.GLM4V:ModelPricing(
                name="z-ai/glm-4.6v",
                input_cost_per_million=0.46,
                output_cost_per_million=1.04
            ),
            ModelType.DEEPSEEK: ModelPricing(
                name="Deep Seek",
                input_cost_per_million=0.80,
                output_cost_per_million=2.0
            ),
            ModelType.AnthropicOpus: ModelPricing(
                name="anthropic/claude-opus-4.5",
                input_cost_per_million=5.30,
                output_cost_per_million=25.90
            ),
            ModelType.QWEN: ModelPricing(
                name="qwen/qwen3-30b-a3b-thinking-2507",
                input_cost_per_million=0.10,
                output_cost_per_million=0.57
            ),
            ModelType.XAI: ModelPricing(
                name="x-ai/grok-4",
                input_cost_per_million=3.60,
                output_cost_per_million=15.60
            ),
            ModelType.ZAI32B: ModelPricing(
                name="z-ai/glm-4-32b",
                input_cost_per_million=0.23,
                output_cost_per_million=0.23
            ),
            ModelType.MISTRALAI: ModelPricing(
                name="mistralai/ministral-14b-2512",
                input_cost_per_million=0.34,
                output_cost_per_million=0.34
            ),
            ModelType.Anthropic: ModelPricing(
                name="anthropic/claude-sonnet-4",
                input_cost_per_million=3.2,
                output_cost_per_million=15.2
            ),
            ModelType.Google: ModelPricing(
                name="google/gemini-3-pro-preview",
                input_cost_per_million=1.30,
                output_cost_per_million=10.2
            ),
            ModelType.Google_flash: ModelPricing(
                name="google/gemini-2.5-flash-lite",
                input_cost_per_million=0.20,
                output_cost_per_million=0.50
            ),
            ModelType.QWEN3: ModelPricing(
                name="qwen/qwen3-vl-30b-a3b-instruct",
                input_cost_per_million=0.24,
                output_cost_per_million=0.76
            )
        }
        
        # Pre-calculate multipliers for efficiency
        self._calculate_multipliers()
    
    def _calculate_multipliers(self):
        """Pre-calculate credit multipliers for each model"""
        self.model_multipliers = {}
        
        for model_type, pricing in self.model_pricing.items():
            # Apply profit margin to costs
            adjusted_input_cost = pricing.input_cost_per_million * self.profit_multiplier
            adjusted_output_cost = pricing.output_cost_per_million * self.profit_multiplier
            
            # Calculate credits per token
            input_multiplier = (adjusted_input_cost / 1_000_000) / self.credit_value
            output_multiplier = (adjusted_output_cost / 1_000_000) / self.credit_value
            
            self.model_multipliers[model_type] = {
                'input': input_multiplier,
                'output': output_multiplier,
                'adjusted_input_cost': adjusted_input_cost,
                'adjusted_output_cost': adjusted_output_cost
            }
    
    def get_available_models(self) -> List[Dict[str, Any]]:
        """Get list of available models with their pricing"""
        models = []
        for model_type, pricing in self.model_pricing.items():
            multipliers = self.model_multipliers[model_type]
            models.append({
                'model_name': model_type.value,
                'name': pricing.name,
                'base_input_cost': pricing.input_cost_per_million,
                'base_output_cost': pricing.output_cost_per_million,
                'adjusted_input_cost': multipliers['adjusted_input_cost'],
                'adjusted_output_cost': multipliers['adjusted_output_cost'],
                'credits_per_1k_input': round(multipliers['input'] * 1000, 4),
                'credits_per_1k_output': round(multipliers['output'] * 1000, 4)
            })
        return models
    
    def calculate_credits_to_deduct(self, token_info: Dict[str, Any], model_name: str) -> Dict[str, Any]:
        """
        Calculate credits to deduct for a specific model
        
        Args:
            token_info: Dict with token usage info
            model_name: Model identifier string
        
        Returns:
            Dict with detailed cost breakdown
        """
        # Convert model_name string to ModelType enum
        try:
            model_type = ModelType(model_name)
        except ValueError:
            raise ValueError(f"Unsupported model: {model_name}")
        
        if model_type not in self.model_multipliers:
            raise ValueError(f"Model {model_name} not configured")
        
        input_tokens = token_info.get('cumulative_input_tokens', 0)
        output_tokens = token_info.get('cumulative_output_tokens', 0)
        embedding_tokens = token_info.get('total_embedding_tokens', 0)

        pricing = self.model_pricing[model_type]
        multipliers = self.model_multipliers[model_type]
        
        # Calculate actual costs (with profit margin)
        input_cost = (input_tokens * multipliers['adjusted_input_cost']) / 1_000_000
        output_cost = (output_tokens * multipliers['adjusted_output_cost']) / 1_000_000
        embedding_cost = (embedding_tokens * self.embedding_pricing['adjusted_input_cost']) / 1_000_000
        total_cost = input_cost + output_cost + embedding_cost
        
        print(embedding_cost, "embedding_cost")
        print(total_cost,"total_cost")
        print(input_cost, "input_cost")
        print(output_cost, "output_cost")

        # Calculate credits to deduct
        input_credits = input_tokens * multipliers['input']
        output_credits = output_tokens * multipliers['output']
        embedding_credits = embedding_tokens * self.embedding_pricing['credits_per_token']
        total_credits = input_credits + output_credits + embedding_credits
        
        print(input_credits, "input_credits")
        print(output_credits,"output_credits")
        print(embedding_credits, "embedding_credits")


        return {
            'model_used': pricing.name,
            'model_name': model_name,
            'input_tokens_used': input_tokens,
            'output_tokens_used': output_tokens,
            'input_cost_usd': round(input_cost, 6),
            'output_cost_usd': round(output_cost, 6),
            'total_cost_usd': round(total_cost, 6),
            'input_credits_deduct': round(input_credits, 4),
            'output_credits_deduct': round(output_credits, 4),
            'embedding_tokens_used': embedding_tokens,
            'embedding_cost_usd': round(embedding_cost, 6),
            'embedding_credits_deduct': round(embedding_credits, 4),
            'total_credits_deduct': round(total_credits, 2),
            'base_input_rate': pricing.input_cost_per_million,
            'base_output_rate': pricing.output_cost_per_million,
            'adjusted_input_rate': multipliers['adjusted_input_cost'],
            'adjusted_output_rate': multipliers['adjusted_output_cost'],
            'embedding_rate': self.embedding_pricing['adjusted_input_cost']
        }
    
    async def _deduct_via_python_db(self, user_id: str, user_balance: float) -> Dict[str, Any]:
        """
        Fallback method to deduct credits using Python DB connection
        
        Args:
            user_id: User identifier
            credits_to_deduct: Credits to deduct
            user_balance: Current user balance
            model_name: Model name for logging
            
        Returns:
            Dict with deduction results
        """
        try:
            if not self.db_manager:
                raise Exception("Database manager not available for fallback")
            
            # Update user balance in database
            success = await self.db_manager.update_user_token(user_id, user_balance)
            
            if success:
                return {
                    'success': True,
                    'method': 'python_db_fallback',
                    'can_afford': True
                }
            else:
                raise Exception("Database update failed")
                
        except Exception as e:
            raise Exception(f"Fallback billing failed: {str(e)}")
        

    async def deduct_credits(self, user_balance: float, token_info: Dict[str, Any], 
                           user_id: str, model_name: str,token:str) -> Dict[str, Any]:
        """
        Deduct credits from user balance based on model and token usage
        
        Args:
            user_balance: User's current credit balance
            token_info: Token usage info
            user_id: User identifier
            model_name: Model used for the request
            
        Returns:
            Dict with deduction results
        """
        try:
            deduction_info = self.calculate_credits_to_deduct(token_info, model_name)
            credits_to_deduct = deduction_info['total_credits_deduct']
            
            # Check if user can afford the operation
            can_afford = user_balance >= credits_to_deduct
            new_balance = round(max(0, user_balance - credits_to_deduct), 2)
            billing_method = "unknown"
            
            # Try Node.js API first
            try:
                credit_client = CreditAPIClient()
                deduct_daily_credits = await credit_client.deduct_daily_credits(
                    token,
                    user_id=user_id, 
                    credits_used=credits_to_deduct, 
                    model_name=model_name
                )

                if not deduct_daily_credits.get('success', True) or 'error' in deduct_daily_credits:
                   raise Exception(f"Node.js API failed: {deduct_daily_credits}")

                billing_method = "node_api"
                print(f"✅ Node.js API: Credits deducted for user {user_id}: {credits_to_deduct}")
                
            except Exception as node_error:
                print(f"⚠️ Node.js API failed: {node_error}")
                
                # Fallback to Python DB
                try:
                    if not self.db_manager:
                        raise Exception("Database manager not available for fallback")
                        
                    # Directly update user credits (no conversion needed)
                    success = await self._deduct_via_python_db(user_id, new_balance)
                    
                    if not success:
                        raise Exception("Database update failed")
                        
                    deduct_daily_credits = {"fallback": True, "new_balance": new_balance}
                    billing_method = "python_db_fallback"
                    print(f"✅ Python DB Fallback: Credits deducted for user {user_id}: {credits_to_deduct}")
                    
                except Exception as python_error:
                    print(f"❌ Both billing methods failed - Node.js: {node_error}, Python: {python_error}")
                    # Critical: Both systems failed - don't return success
                    return {
                        'success': False,
                        'error': 'All billing systems unavailable',
                        'old_balance': user_balance,
                        'new_balance': user_balance,
                        'credits_deducted': 0,
                        'node_error': str(node_error),
                        'python_error': str(python_error)
                    }
            
            return {
                'success': True,
                'billing_method': billing_method,
                'model_used': deduction_info['model_used'],
                'old_balance': user_balance,
                'new_balance': new_balance,
                'credits_deducted': credits_to_deduct,
                'can_afford': can_afford,
                'deduction_details': deduction_info,
                'api_result': deduct_daily_credits
            }
            
        except ValueError as e:
            return {
                'success': False,
                'error': str(e),
                'old_balance': user_balance,
                'new_balance': user_balance,
                'credits_deducted': 0
            }
    
    def estimate_tokens_for_credits(self, available_credits: float, model_name: str) -> Dict[str, int]:
        """
        Estimate how many tokens a user can afford with their current credits
        
        Args:
            available_credits: User's available credits
            model_name: Model to calculate for
        
        Returns:
            Dict with estimated token limits
        """
        try:
            model_type = ModelType(model_name)
            multipliers = self.model_multipliers[model_type]
            
            # Estimate assuming 80% input, 20% output tokens (typical ratio)
            mixed_rate = (multipliers['input'] * 0.8) + (multipliers['output'] * 0.2)
            estimated_total_tokens = int(available_credits / mixed_rate)
            
            # Pure input/output estimates
            max_input_tokens = int(available_credits / multipliers['input'])
            max_output_tokens = int(available_credits / multipliers['output'])
            
            return {
                'estimated_total_tokens': estimated_total_tokens,
                'max_input_only_tokens': max_input_tokens,
                'max_output_only_tokens': max_output_tokens,
                'assumption': "80% input, 20% output tokens"
            }
        except ValueError:
            return {'error': f'Invalid model: {model_name}'}

# Usage examples and testing
def main():
    # Initialize calculator
    calculator = MultiModelTokenCalculator(profit_multiplier=1.5)
    
    print("MULTI-MODEL TOKEN CALCULATOR")
    print("=" * 50)
    
    # Show available models
    print("\nAvailable Models:")
    print("-" * 30)
    for model in calculator.get_available_models():
        print(f"{model['name']}")
        print(f"  ID: {model['model_name']}")
        print(f"  Input: ${model['adjusted_input_cost']:.2f}/M tokens")
        print(f"  Output: ${model['adjusted_output_cost']:.2f}/M tokens")
        print(f"  Credits per 1K input: {model['credits_per_1k_input']}")
        print(f"  Credits per 1K output: {model['credits_per_1k_output']}")
        print()
    
    # Test token usage
    token_usage = {
        'cumulative_input_tokens': 21582,
        'cumulative_output_tokens': 1068,
        'cumulative_total_tokens': 22650
    }
    
    print("COST COMPARISON FOR SAME USAGE:")
    print("-" * 40)
    print(f"Usage: {token_usage['cumulative_input_tokens']:,} input, {token_usage['cumulative_output_tokens']:,} output tokens")
    print()
    
    # Compare costs across all models
    for model_type in ModelType:
        try:
            result = calculator.calculate_credits_to_deduct(token_usage, model_type.value)
            print(f"{result['model_used']}:")
            print(f"  Cost: ${result['total_cost_usd']:.4f}")
            print(f"  Credits: {result['total_credits_deduct']}")
            print()
        except ValueError as e:
            print(f"Error with {model_type.value}: {e}")
    
    # Test credit estimation
    print("CREDIT ESTIMATION (15,000 credits available):")
    print("-" * 45)
    test_credits = 15000
    
    for model_type in ModelType:
        estimation = calculator.estimate_tokens_for_credits(test_credits, model_type.value)
        if 'error' not in estimation:
            model_name = calculator.model_pricing[model_type].name
            print(f"{model_name}:")
            print(f"  Estimated total tokens: {estimation['estimated_total_tokens']:,}")
            print(f"  Max input only: {estimation['max_input_only_tokens']:,}")
            print(f"  Max output only: {estimation['max_output_only_tokens']:,}")
            print()

if __name__ == "__main__":
    main()