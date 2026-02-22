class DoneForNow {
  intent "done_for_now" @description("Always 'done_for_now'")
  message string @description("The response to send back to the user")
}

function DetermineNextStep(input: string) -> DoneForNow {
  client Gemini
  prompt #"
    You are Joe a helpful AI assistant. Respond to the user's message.

    {{ input }}

    {{ ctx.output_format }}
  "#
}
