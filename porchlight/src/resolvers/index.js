// Registers Porchlight's resolvers with Forge.
//
// The page calls invoke('saveNote', ...) or invoke('listNotes'). Forge sends that
// call to the `resolver` function in manifest.yml, whose handler is the `handler`
// exported here. The Resolver class looks at the name and runs the matching function.
import Resolver from '@forge/resolver';
import { listNotes, saveNote } from './notes.js';

const resolver = new Resolver();

resolver.define('listNotes', listNotes);
resolver.define('saveNote', saveNote);

export const handler = resolver.getDefinitions();
