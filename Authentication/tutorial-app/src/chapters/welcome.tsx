import type { ReactNode } from 'react';
import { Box, ChapterIntro, TableWrap } from '../components/Content';
import { ByStack } from '../components/Stacks';
import { CHAPTERS } from './index';
import { hrefFor } from '../lib/route';

const Ch = ({ id, children }: { id: string; children: ReactNode }) => <a href={hrefFor(id)}>{children}</a>;

export function Welcome() {
  const groups = [...new Set(CHAPTERS.map((c) => c.group))];
  return (
    <>
      <ChapterIntro
        time="15 minutes"
        learn={[
          'What the lab covers, and the order to read it in',
          'How each method is shown three times, in Node.js, Python and .NET, and how to choose your stack',
          'How to study a chapter so it sticks: read, run the tests, rebuild it yourself, then do the exercises',
        ]}
      />

      <div className="prose">
        <p>
          This lab teaches every common way to sign users and systems in, from passwords and cookies to OAuth 2.0, OpenID
          Connect, SAML, passkeys and client certificates. Each method gets its own chapter: what problem it solves, how
          it works on the wire, a complete implementation, the attacks against it, and the mistakes people make.
        </p>
        <p>
          Every implementation exists in three stacks, written to behave identically: the same routes, the same status
          codes, the same JSON. So you can learn a method in the stack you use at work, then flip to another stack and see
          how its libraries do the same job.
        </p>
      </div>

      <h2>Choose your stack</h2>
      <div className="prose">
        <p>
          Code appears in tabs like the ones below. Pick a tab and every example in the lab switches to that stack; the
          lab remembers your choice.
        </p>
      </div>
      <ByStack
        label="Your stack"
        node={<Box kind="tip" label="Node.js"><p>Express 5, with TypeScript run directly by Node (no build step). Tests use the built-in <code>node:test</code> runner.</p></Box>}
        python={<Box kind="tip" label="Python"><p>FastAPI with Pydantic. Tests use pytest and FastAPI’s <code>TestClient</code>.</p></Box>}
        dotnet={<Box kind="tip" label=".NET"><p>ASP.NET Core minimal APIs on .NET 9, using the framework’s own authentication handlers where they exist. Tests use xUnit and <code>WebApplicationFactory</code>.</p></Box>}
      />

      <h2>What is in the lab</h2>
      <TableWrap>
        <thead>
          <tr><th>Part</th><th>Chapters</th></tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g}>
              <td>{g}</td>
              <td>
                {CHAPTERS.filter((c) => c.group === g).map((c, i) => (
                  <span key={c.id}>
                    {i > 0 && ' · '}
                    <Ch id={c.id}>{c.title}</Ch>
                  </span>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>
          Start with <Ch id="methods">Every way to authenticate, at a glance</Ch> to see the whole map, set up your
          tools in <Ch id="setup">chapter 03</Ch>, then read in order: later chapters build on passwords, sessions and
          JWTs. If you need one method now, jump to it; each chapter says what it assumes.
        </p>
      </div>

      <h2>How to study a chapter</h2>
      <ol className="prose">
        <li><strong>Read</strong> the explanation and the diagram until you can describe the flow without looking.</li>
        <li><strong>Run the tests</strong> in <code>snippets/&lt;topic&gt;/&lt;stack&gt;</code>. Every file you see in the chapter is the file that passed them.</li>
        <li><strong>Rebuild it yourself</strong> in <code>Authentication/projects/&lt;topic&gt;</code>, from an empty folder, looking back only when stuck.</li>
        <li><strong>Do the exercises</strong> at the end; each one adds a piece real systems need.</li>
        <li><strong>Break it on purpose</strong>: remove a check (the audience, the nonce, the constant-time compare) and watch which test fails.</li>
      </ol>

      <Box kind="tip" label="Stuck on a word?">
        <p>
          Double-click any word to see it in Tamil, or select a phrase or sentence for a small menu: <strong>Speak</strong>{' '}
          reads it aloud, <strong>Translate</strong> shows it in Tamil, <strong>Explain</strong> asks Claude for a
          short explanation of what it means on this page, and <strong>Ask</strong> opens a box where you type your own
          question about it, then follow-ups. Explain and Ask need the lab’s dev server and your Claude sign-in
          (<code>ant auth login</code>).
        </p>
      </Box>

      <Box kind="warn" label="Learning code, not a product">
        <p>
          The projects keep users, sessions and tokens in memory so each chapter stays focused. Real systems keep them in a
          database or Redis, run behind TLS, and usually use a hosted identity provider or a maintained framework for the
          parts that are easy to get wrong. Each chapter points out what changes in production.
        </p>
      </Box>
    </>
  );
}
