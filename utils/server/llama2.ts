import { Message } from '@/types/chat';



export const experimental_buildLlama2Prompt = (
  messages: Pick<Message, 'content' | 'role'>[]
) => {
  const startPrompt = `<s>[INST] `
  const endPrompt = ` [/INST]`
  const conversation = messages.map(({ content, role }, index) => {
    if (role === 'user') {
      return content.trim()
    } else if (role === 'assistant') {
      return ` [/INST] ${content}</s><s>[INST] `
    } else if (role === 'function') {
      throw new Error('Llama 2 does not support function calls.')
    } else if (role === 'system' && index === 0) {
      return `<<SYS>>\n${content}\n<</SYS>>\n\n`
    } else {
      throw new Error(`Invalid message role: ${role}`)
    }
  })

  return startPrompt + conversation.join('') + endPrompt
}