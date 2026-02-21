Questions/Answers Format:
A single Question should begin with the tag <question_*agent_name*> and a property called "number"=<*number*>, so that questions can be identified by number.
then the question text should be provided next, in a <text> tag
My response will come next, tagged as follows:
<user_response>
    <text>
    </text>
</user_response>
The tags for each of those choices should be placed after the closing </text> tag so that I may enter my response without needing to type the tags.

Responses or rebuttals from agents should be tagged as <response_*agent_name*> where the name of the agent replaces `*agent_name*`, and an empty user_response block should be added after for the user to fill in.

There should be only one question per <text> tag.

Example:
<question_claude number=42>
<text>
Should the routing allow REGISTERED to Phase 1.1? I believe yes, since re-registration is an existing flow.
</text>
<user_response>
    <text> what is the scenario where a registered device would send this command?</text>
</user_response>
<response_claude>
The scenario where a registered device would send this command is as follows: ...
</response_claude>
<user_response>
    <text> Yes, the routing should allow going from REGISTERED to NEW_DEVICE</text>
</user_response>
</question_claude>

If a user asks a question in a question file that is not in response to any pre-existing questions in that same file, respond in-line with the correct tags.

Do not combine multiple questions into a single question tag.

## File Naming

Question files: `Q<number>_short_description.md` (e.g., `Q1_api_rate_limiting.md`)
New questions go in `Questions/Awaiting/`.
Resolved questions go in `Questions/Resolved/` with a `**RESOLVED**` header.
Deferred questions go in `Questions/Deferred/`.
