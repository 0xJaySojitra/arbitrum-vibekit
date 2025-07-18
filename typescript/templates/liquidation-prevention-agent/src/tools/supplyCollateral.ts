/**
 * supplyCollateral Tool
 * 
 * Supplies collateral to Aave via Ember MCP server to improve health factor
 * and prevent liquidation.
 */

import { createSuccessTask, createErrorTask, type VibkitToolDefinition, parseMcpToolResponsePayload } from 'arbitrum-vibekit-core';
import { z } from 'zod';
import type { LiquidationPreventionContext } from '../context/types.js';
import { TransactionPlan, TransactionPlanSchema, SupplyResponseSchema } from 'ember-schemas';
import { parseUserPreferences, mergePreferencesWithDefaults, generatePreferencesSummary } from '../utils/userPreferences.js';

// Input schema for supplyCollateral tool
const SupplyCollateralParams = z.object({
  tokenAddress: z.string().describe('The token contract address to supply'),
  amount: z.string().describe('The amount to supply (in token units)'),
  userAddress: z.string().describe('The user wallet address'),
  instruction: z.string().optional().describe('Natural language instruction with user preferences'),
  chainId: z.string().optional().describe('The chain ID (defaults to Arbitrum)'),
});

// supplyCollateral tool implementation
export const supplyCollateralTool: VibkitToolDefinition<typeof SupplyCollateralParams, any, LiquidationPreventionContext, any> = {
  name: 'supply-collateral',
  description: 'Supply tokens as collateral to Aave to improve health factor and prevent liquidation',
  parameters: SupplyCollateralParams,
  execute: async (args, context) => {
    try {
      // Parse user preferences from instruction (Task 4.3)
      const userPrefs = parseUserPreferences(args.instruction || '');
      const mergedPrefs = mergePreferencesWithDefaults(userPrefs, {
        thresholds: context.custom.thresholds,
        monitoring: context.custom.monitoring,
        strategy: context.custom.strategy,
      });
      
      console.log(`💰 Supplying collateral: ${args.amount} tokens at ${args.tokenAddress} for user ${args.userAddress}`);
      console.log(`⚙️  User preferences: ${generatePreferencesSummary(mergedPrefs)}`);
      console.log('💰 args........:', args);
      // Access Ember MCP client from custom context  
      const emberClient = context.custom.mcpClient;

      if (!emberClient) {
        throw new Error('Ember MCP client not found in context');
      }

      console.log("calling lendingSupply..........!!!");
      // Call the Ember MCP server's lendingSupply tool to get transaction plan
      const result = await emberClient.callTool({
        name: 'lendingSupply',
        arguments: {
          tokenUid: {
            chainId: args.chainId || '42161', // Default to Arbitrum
            address: args.tokenAddress,
          },
          amount: args.amount,
          walletAddress: args.userAddress,
        },
      });
      console.log('💰 supplyCollateral result........:', result);

      if (result.isError) {
        console.error('❌ Error calling supply tool:', result.content);
        let errorMessage = 'Unknown error';
        if (Array.isArray(result.content) && result.content[0]?.text) {
          errorMessage = result.content[0].text;
        }
        throw new Error(`Failed to prepare supply transaction: ${errorMessage}`);
      }

      // Parse and validate the supply response from MCP
      console.log('📋 Parsing supply response from MCP...');
      const supplyResp = parseMcpToolResponsePayload(result, SupplyResponseSchema);
      const { transactions } = supplyResp;
      console.log(`📋 Received ${transactions.length} transaction(s) to execute`);

      // Execute the transactions using the user's wallet
      try {
        console.log('⚡ Executing supply transactions...');
        const executionResult = await context.custom.executeTransaction('supply-collateral', transactions);

        console.log(`✅ Successfully executed supply collateral transactions`);

        // Return structured success response that frontend can display
        const successMessage = `💰 Successfully supplied ${args.amount} tokens as collateral to improve health factor and prevent liquidation`;
        
        return createSuccessTask(
          'supply-collateral',
          undefined, // No artifacts needed
          `🛡️ ${successMessage}. ${executionResult}`
        );
      } catch (executionError) {
        console.error('❌ Transaction execution failed:', executionError);
        throw new Error(`Failed to execute supply transaction: ${executionError instanceof Error ? executionError.message : 'Unknown execution error'}`);
      }

    } catch (error) {
      console.error('❌ supplyCollateral tool error:', error);
      throw error instanceof Error ? error : new Error(`Failed to supply collateral: ${error}`);
    }
  },
}; 
 