import { vaultState } from "../state.js";
import { buildFieldAad } from "../keys.js";
import { decryptBuffer } from "../crypto.js";
import { getMessagesForAnalytics } from "../../db/repository/messages.repository.js";
import { getAllChatsRecords } from "../../db/repository/chats.repository.js";
import { decryptChatTitle } from "../chats/chat-utils.js";
import type {
  AnalyticsSummaryResponse,
  AnalyticsPeriodDto,
  AnalyticsTotalsDto,
  ModelAnalyticsDto,
  ChatCostSummaryDto,
  DailyUsageDto,
  AnalyticsPeriodPreset,
} from "@ai-vault/types";

export interface AnalyticsQueryOptions {
  period?: AnalyticsPeriodPreset | string;
  from?: string;
  to?: string;
  topChatsLimit?: number;
}

function resolveDateRange(options: AnalyticsQueryOptions): {
  fromDate?: Date;
  toDate?: Date;
  preset: string;
  fromIso: string | null;
  toIso: string | null;
} {
  const now = new Date();

  // If explicit from/to are passed, treat as custom range
  if (options.from || options.to) {
    const fromDate = options.from ? new Date(options.from) : undefined;
    const toDate = options.to ? new Date(options.to) : undefined;

    return {
      fromDate,
      toDate,
      preset: options.period || "custom",
      fromIso: fromDate ? fromDate.toISOString() : null,
      toIso: toDate ? toDate.toISOString() : null,
    };
  }

  const preset = (options.period || "all").toLowerCase();

  switch (preset) {
    case "today": {
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);
      return {
        fromDate: startOfDay,
        toDate: now,
        preset: "today",
        fromIso: startOfDay.toISOString(),
        toIso: now.toISOString(),
      };
    }
    case "7d": {
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return {
        fromDate: sevenDaysAgo,
        toDate: now,
        preset: "7d",
        fromIso: sevenDaysAgo.toISOString(),
        toIso: now.toISOString(),
      };
    }
    case "30d": {
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return {
        fromDate: thirtyDaysAgo,
        toDate: now,
        preset: "30d",
        fromIso: thirtyDaysAgo.toISOString(),
        toIso: now.toISOString(),
      };
    }
    case "this_month": {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      return {
        fromDate: startOfMonth,
        toDate: now,
        preset: "this_month",
        fromIso: startOfMonth.toISOString(),
        toIso: now.toISOString(),
      };
    }
    case "all":
    default: {
      return {
        fromDate: undefined,
        toDate: undefined,
        preset: "all",
        fromIso: null,
        toIso: null,
      };
    }
  }
}

export async function getAnalyticsSummary(
  sessionToken: string,
  options: AnalyticsQueryOptions = {}
): Promise<AnalyticsSummaryResponse> {
  const { fromDate, toDate, preset, fromIso, toIso } = resolveDateRange(options);
  const topChatsLimit = options.topChatsLimit && options.topChatsLimit > 0 ? options.topChatsLimit : 10;

  // 1. Fetch relevant message and chat records
  const [messages, chatRecords] = await Promise.all([
    getMessagesForAnalytics({ from: fromDate, to: toDate }),
    getAllChatsRecords(),
  ]);

  const chatRecordMap = new Map<string, (typeof chatRecords)[0]>();
  for (const c of chatRecords) {
    chatRecordMap.set(c.id, c);
  }

  // 2. Perform in-memory decryption and aggregation with dbKey
  return await vaultState.withDbKey(sessionToken, (dbKey) => {
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalThoughtTokens = 0;
    let totalInputCost = 0;
    let totalOutputCost = 0;
    let totalThoughtCost = 0;
    let totalCost = 0;

    let userMessagesCount = 0;
    let assistantMessagesCount = 0;
    let systemMessagesCount = 0;

    interface ModelAccumulator {
      modelName: string;
      provider?: string;
      messageCount: number;
      inputTokens: number;
      outputTokens: number;
      thoughtTokens: number;
      totalTokens: number;
      inputCost: number;
      outputCost: number;
      thoughtCost: number;
      totalCost: number;
    }

    interface ChatAccumulator {
      chatId: string;
      messageCount: number;
      inputTokens: number;
      outputTokens: number;
      thoughtTokens: number;
      totalTokens: number;
      inputCost: number;
      outputCost: number;
      thoughtCost: number;
      totalCost: number;
    }

    interface DailyAccumulator {
      date: string;
      inputTokens: number;
      outputTokens: number;
      thoughtTokens: number;
      totalTokens: number;
      inputCost: number;
      outputCost: number;
      thoughtCost: number;
      totalCost: number;
      userMessages: number;
      assistantMessages: number;
      totalMessages: number;
    }

    const modelMap = new Map<string, ModelAccumulator>();
    const chatUsageMap = new Map<string, ChatAccumulator>();
    const dailyMap = new Map<string, DailyAccumulator>();

    for (const msg of messages) {
      const msgDateStr = msg.created_at.toISOString().split("T")[0];

      if (!dailyMap.has(msgDateStr)) {
        dailyMap.set(msgDateStr, {
          date: msgDateStr,
          inputTokens: 0,
          outputTokens: 0,
          thoughtTokens: 0,
          totalTokens: 0,
          inputCost: 0,
          outputCost: 0,
          thoughtCost: 0,
          totalCost: 0,
          userMessages: 0,
          assistantMessages: 0,
          totalMessages: 0,
        });
      }
      const dailyEntry = dailyMap.get(msgDateStr)!;
      dailyEntry.totalMessages += 1;

      if (!chatUsageMap.has(msg.chat_id)) {
        chatUsageMap.set(msg.chat_id, {
          chatId: msg.chat_id,
          messageCount: 0,
          inputTokens: 0,
          outputTokens: 0,
          thoughtTokens: 0,
          totalTokens: 0,
          inputCost: 0,
          outputCost: 0,
          thoughtCost: 0,
          totalCost: 0,
        });
      }
      const chatEntry = chatUsageMap.get(msg.chat_id)!;
      chatEntry.messageCount += 1;

      if (msg.role === "user") {
        userMessagesCount += 1;
        dailyEntry.userMessages += 1;
      } else if (msg.role === "assistant") {
        assistantMessagesCount += 1;
        dailyEntry.assistantMessages += 1;
      } else {
        systemMessagesCount += 1;
      }

      // Decrypt message metadata if available
      if (msg.encrypted_metadata && msg.metadata_iv && msg.metadata_tag) {
        try {
          const metadataAad = buildFieldAad("message", msg.id, "metadata", msg.encryption_version);
          const decMeta = decryptBuffer(
            {
              ciphertext: msg.encrypted_metadata,
              iv: msg.metadata_iv,
              tag: msg.metadata_tag,
            },
            dbKey,
            metadataAad
          );

          let metaStr: string;
          try {
            metaStr = decMeta.toString("utf-8");
          } finally {
            decMeta.fill(0);
          }

          const metaObj = JSON.parse(metaStr);
          const modelName: string = metaObj.model_name || metaObj.model || "Unknown";
          const stats = metaObj.stats || {};

          const inT = Number(stats.input_tokens) || 0;
          const outT = Number(stats.output_tokens) || 0;
          const thoughtT = Number(stats.thought_tokens) || 0;
          const inCost = Number(stats.input_cost) || 0;
          const outCost = Number(stats.output_cost) || 0;
          const thoughtCost = Number(stats.thought_cost) || 0;
          const msgTotCost = inCost + outCost;
          const msgTotTokens = inT + outT + thoughtT;

          // Add to Global totals
          totalInputTokens += inT;
          totalOutputTokens += outT;
          totalThoughtTokens += thoughtT;
          totalInputCost += inCost;
          totalOutputCost += outCost;
          totalThoughtCost += thoughtCost;
          totalCost += msgTotCost;

          // Add to Daily Entry
          dailyEntry.inputTokens += inT;
          dailyEntry.outputTokens += outT;
          dailyEntry.thoughtTokens += thoughtT;
          dailyEntry.totalTokens += msgTotTokens;
          dailyEntry.inputCost += inCost;
          dailyEntry.outputCost += outCost;
          dailyEntry.thoughtCost += thoughtCost;
          dailyEntry.totalCost += msgTotCost;

          // Add to Chat Entry
          chatEntry.inputTokens += inT;
          chatEntry.outputTokens += outT;
          chatEntry.thoughtTokens += thoughtT;
          chatEntry.totalTokens += msgTotTokens;
          chatEntry.inputCost += inCost;
          chatEntry.outputCost += outCost;
          chatEntry.thoughtCost += thoughtCost;
          chatEntry.totalCost += msgTotCost;

          // Add to Model Map
          if (!modelMap.has(modelName)) {
            modelMap.set(modelName, {
              modelName,
              provider: metaObj.provider || undefined,
              messageCount: 0,
              inputTokens: 0,
              outputTokens: 0,
              thoughtTokens: 0,
              totalTokens: 0,
              inputCost: 0,
              outputCost: 0,
              thoughtCost: 0,
              totalCost: 0,
            });
          }
          const modelEntry = modelMap.get(modelName)!;
          modelEntry.messageCount += 1;
          modelEntry.inputTokens += inT;
          modelEntry.outputTokens += outT;
          modelEntry.thoughtTokens += thoughtT;
          modelEntry.totalTokens += msgTotTokens;
          modelEntry.inputCost += inCost;
          modelEntry.outputCost += outCost;
          modelEntry.thoughtCost += thoughtCost;
          modelEntry.totalCost += msgTotCost;
        } catch (err) {
          console.warn(`[getAnalyticsSummary] Failed to decrypt metadata for message ${msg.id}:`, err);
        }
      }
    }

    const overallTotalTokens = totalInputTokens + totalOutputTokens + totalThoughtTokens;

    // 3. Process Model Analytics Breakdown
    const modelBreakdown: ModelAnalyticsDto[] = Array.from(modelMap.values()).map((m) => ({
      modelName: m.modelName,
      provider: m.provider,
      messageCount: m.messageCount,
      inputTokens: m.inputTokens,
      outputTokens: m.outputTokens,
      thoughtTokens: m.thoughtTokens,
      totalTokens: m.totalTokens,
      inputCost: Number(m.inputCost.toFixed(6)),
      outputCost: Number(m.outputCost.toFixed(6)),
      thoughtCost: Number(m.thoughtCost.toFixed(6)),
      totalCost: Number(m.totalCost.toFixed(6)),
      percentageOfTotalCost:
        totalCost > 0 ? Number(((m.totalCost / totalCost) * 100).toFixed(2)) : 0,
      percentageOfTotalTokens:
        overallTotalTokens > 0
          ? Number(((m.totalTokens / overallTotalTokens) * 100).toFixed(2))
          : 0,
    }));

    // Sort models by message count descending
    modelBreakdown.sort((a, b) => b.messageCount - a.messageCount);

    let mostUsedModel: string | null = null;
    let mostExpensiveModel: string | null = null;

    if (modelBreakdown.length > 0) {
      mostUsedModel = modelBreakdown[0].modelName;
      const sortedByCost = [...modelBreakdown].sort((a, b) => b.totalCost - a.totalCost);
      mostExpensiveModel = sortedByCost[0].totalCost > 0 ? sortedByCost[0].modelName : modelBreakdown[0].modelName;
    }

    // 4. Process Top Expensive Chats
    const chatSummaries: ChatCostSummaryDto[] = [];
    for (const [chatId, usage] of chatUsageMap.entries()) {
      const chatRec = chatRecordMap.get(chatId);
      const chatTitle = chatRec ? decryptChatTitle(chatRec, dbKey, true) : "Untitled Chat";
      const createdAt = chatRec ? chatRec.created_at.toISOString() : new Date().toISOString();
      const updatedAt = chatRec ? chatRec.updated_at.toISOString() : new Date().toISOString();

      chatSummaries.push({
        id: chatId,
        title: chatTitle,
        messageCount: usage.messageCount,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        thoughtTokens: usage.thoughtTokens,
        totalTokens: usage.totalTokens,
        inputCost: Number(usage.inputCost.toFixed(6)),
        outputCost: Number(usage.outputCost.toFixed(6)),
        thoughtCost: Number(usage.thoughtCost.toFixed(6)),
        totalCost: Number(usage.totalCost.toFixed(6)),
        createdAt,
        updatedAt,
      });
    }

    // Sort chats by total cost descending (secondary sort total tokens)
    chatSummaries.sort((a, b) => {
      if (b.totalCost !== a.totalCost) {
        return b.totalCost - a.totalCost;
      }
      return b.totalTokens - a.totalTokens;
    });

    const topExpensiveChats = chatSummaries.slice(0, topChatsLimit);

    // 5. Process Daily Timeline
    const timeline: DailyUsageDto[] = Array.from(dailyMap.values())
      .map((d) => ({
        date: d.date,
        inputTokens: d.inputTokens,
        outputTokens: d.outputTokens,
        thoughtTokens: d.thoughtTokens,
        totalTokens: d.totalTokens,
        inputCost: Number(d.inputCost.toFixed(6)),
        outputCost: Number(d.outputCost.toFixed(6)),
        thoughtCost: Number(d.thoughtCost.toFixed(6)),
        totalCost: Number(d.totalCost.toFixed(6)),
        userMessages: d.userMessages,
        assistantMessages: d.assistantMessages,
        totalMessages: d.totalMessages,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // 6. Build Final Response
    const periodDto: AnalyticsPeriodDto = {
      preset,
      from: fromIso,
      to: toIso,
    };

    const totalsDto: AnalyticsTotalsDto = {
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      thoughtTokens: totalThoughtTokens,
      totalTokens: overallTotalTokens,
      inputCost: Number(totalInputCost.toFixed(6)),
      outputCost: Number(totalOutputCost.toFixed(6)),
      thoughtCost: Number(totalThoughtCost.toFixed(6)),
      totalCost: Number(totalCost.toFixed(6)),
      totalMessages: messages.length,
      userMessages: userMessagesCount,
      assistantMessages: assistantMessagesCount,
      systemMessages: systemMessagesCount,
      totalChats: chatRecords.length,
      activeChats: chatUsageMap.size,
    };

    return {
      success: true,
      period: periodDto,
      totals: totalsDto,
      models: {
        mostUsed: mostUsedModel,
        mostExpensive: mostExpensiveModel,
        breakdown: modelBreakdown,
      },
      topExpensiveChats,
      timeline,
    };
  });
}
