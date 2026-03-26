import os
from autogen_agentchat.agents import AssistantAgent
from autogen_ext.models.openai import OpenAIChatCompletionClient

def make_client(model: str = "gemini-3.1-pro-preview", temperature: float = 0.7):
    return OpenAIChatCompletionClient(
        model=model,
        api_key=os.environ["GEMINI_API_KEY"],
        base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
        temperature=temperature,
        model_capabilities={
            "vision": False,
            "function_calling": False,
            "json_output": False,
        },
    )

def build_agents(personas: list[dict], client) -> list[AssistantAgent]:
    """Build AutoGen agents from persona DB records.
    Each persona dict has: id, name, role, description, system_prompt
    """
    agents = []
    for p in personas:
        agents.append(
            AssistantAgent(
                name=p["name"],
                description=p["description"],
                system_message=p["system_prompt"],
                model_client=client,
            )
        )
    return agents
