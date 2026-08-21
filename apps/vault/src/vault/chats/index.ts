export {
  ChatNotFoundError
} from "./chat-utils.js";

export {
  createChat,
  listChats,
  getChat,
  getChatMessages,
  removeChat
} from "./chat-crud.js";

export {
  sendMessageAndExecute,
  type SendMessageParams,
  type SendMessageResult
} from "./chat-execution.js";

// Export the single decryptChatTitle so that tests can import it to verify AAD integrity
export { decryptChatTitle } from "./chat-utils.js";
