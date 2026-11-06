import Resolver from '@forge/resolver';

const resolver = new Resolver();

resolver.define('getText', (req) => {
  console.log(req);

  const issue = req.context.extension.issue;
  return `Hello, ${issue.key}!`;
});

export const handler = resolver.getDefinitions();
