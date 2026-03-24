Always read .claude/MEMORY.md and .claude/octo-debate-workflow.txt at session start

write plain-text responses, not markdown.

## Coding Conventions

No destructuring. Destructuring makes code unreadable. Always use explicit objects and types with named properties instead.

Bad:  const { foo, bar, baz } = someObject;
Bad:  (setFooterOptions, setFooterShortcuts, terminal, layout) => ...
Good: const opts = someObject;  then reference opts.foo, opts.bar, opts.baz
Good: (props: ShellRenderProps) => ...  then reference props.terminal, props.layout