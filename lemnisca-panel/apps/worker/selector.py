from collections import defaultdict

def make_selector_func(persona_names: list[str]):
    """Returns a rotation-enforcing selector function.
    Adapted from v3/lemnisca_panelv3.py make_selector_func().
    Works with any list of persona names.
    """
    last_spoke = defaultdict(int)
    turn_counter = [0]

    def selector_func(messages):
        turn_counter[0] += 1
        current_turn = turn_counter[0]

        last_speaker = None
        for msg in reversed(messages):
            source = getattr(msg, "source", None)
            if source in persona_names:
                last_speaker = source
                break

        candidates = [p for p in persona_names if p != last_speaker]
        candidates.sort(key=lambda p: last_spoke[p])
        chosen = candidates[0]
        last_spoke[chosen] = current_turn
        return chosen

    return selector_func

def generate_selector_prompt(persona_names: list[str], persona_descriptions: dict[str, str], max_rounds: int) -> str:
    """Dynamically generate the selector prompt based on session config.
    Phase boundaries are proportional to max_rounds.
    """
    participants_block = "\n".join(
        f"- {name}: {persona_descriptions[name]}" for name in persona_names
    )
    n = len(persona_names)

    # Proportional phase boundaries
    p1_end = max(1, int(max_rounds * 0.30))
    p2_end = max(p1_end + 1, int(max_rounds * 0.60))
    p3_end = max(p2_end + 1, int(max_rounds * 0.84))
    p4_start = p3_end + 1

    return f"""You are selecting the next speaker in an expert brainstorming panel.

The participants are:
{participants_block}

STRICT ROTATION RULE — THIS IS YOUR MOST IMPORTANT INSTRUCTION:
Look at the last {n} messages in the conversation history and identify which participants
have spoken. DO NOT select anyone who has spoken in the last {max(2, n // 2)} messages.
Prioritize participants who have NOT spoken recently.

SELECTION RULES (apply after rotation rule):
1. If a strong claim was just made, select someone who would DISAGREE with it
2. If a product idea was proposed, select someone who would stress-test it
3. If discussion gets abstract, select someone who would ground it
4. If the group is converging too fast, select someone who would challenge
5. ALL {n} participants must speak in every {n}-message window — no exceptions

CRITICAL: You MUST select a different participant than the last speaker.
You MUST ensure all {n} participants get roughly equal airtime.

PHASE AWARENESS:
- Turns 1-{p1_end}:     Each persona stakes their position
- Turns {p1_end+1}-{p2_end}:   Cross-debate — challenge each other
- Turns {p2_end+1}-{p3_end}:   Converge on specific, named concepts
- Turns {p4_start}-{max_rounds}:  Stress-test and rank the shortlist

Select only ONE participant name from the list above.
"""
