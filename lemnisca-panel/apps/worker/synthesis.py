from autogen_agentchat.agents import AssistantAgent
from autogen_agentchat.messages import TextMessage
from autogen_core import CancellationToken

SYNTHESIS_PROMPT = """
You are a Senior Strategy Synthesizer reading a complete expert panel discussion
transcript. Produce a structured, actionable final report. Every sentence must
earn its place. Use any domain-specific classification frameworks referenced
in the discussion where relevant (e.g., lifecycle contexts, problem hierarchies).

## 1. Consensus Areas
What did the panel genuinely agree on? Which pain areas and directions
had multi-persona support? Be specific about which categories converged.

## 2. Key Tensions and Unresolved Debates
What were the most important disagreements? Where did personas clash most
productively? What remains unresolved and why does it matter?

## 3. Shortlisted Concepts
List the 2-4 strongest concepts that emerged. For each:
  - Name / working title
  - Product form (triage tool / diagnostic framework / assessment calculator / etc.)
  - Which user pain it addresses
  - Why it works as a top-of-funnel wedge (if applicable)
  - Strongest objection raised by the panel
  - Confidence: High / Medium / Exploratory

## 4. Explicitly Rejected Directions
What ideas did the panel dismiss and why? Be blunt.

## 5. Recommended First Move
One concrete recommendation specific enough to brief a product team tomorrow.

## 6. Open Questions That Would Change the Direction
What do we still not know that could significantly alter the recommendation?
"""

async def run_synthesis(messages_text: str, client) -> str:
    """Run the synthesizer agent on the transcript and return the synthesis text."""
    synthesizer = AssistantAgent(
        name="Synthesizer",
        description="Produces the final structured synthesis report.",
        system_message=SYNTHESIS_PROMPT,
        model_client=client,
    )

    response = await synthesizer.on_messages(
        [TextMessage(
            content=(
                "Here is the complete panel discussion transcript:\n\n"
                + messages_text
                + "\n\nPlease produce the full structured synthesis report now."
            ),
            source="user",
        )],
        cancellation_token=CancellationToken(),
    )

    return response.chat_message.content if response.chat_message else ""
