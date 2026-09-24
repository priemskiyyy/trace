/** RudderStack's data plane refuses an event larger than 32 KB, read as 32,768 bytes; its SDK only warns, counting characters. */
export const MAX_EVENT_SIZE = 32 * 1024;
