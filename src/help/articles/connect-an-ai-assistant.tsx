import { APP_ORIGIN, INSTANCE_NAME } from '@/lib/site-config';
import { MCP_RESOURCE_PATH, OAUTH_TTL } from '@/oauth/config';
import { CopyText, Screenshot, Step, Steps, Ui } from '../components';
import { UI } from './connect-an-ai-assistant.ui';

export { UI };

// Every site has its own address, so this is built, never typed.
const MCP_ADDRESS = `${APP_ORIGIN}${MCP_RESOURCE_PATH}`;

const DAY = 24 * 60 * 60;
const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;
// The longest a connection lasts, counted from the first time you choose
// Allow: approving again keeps the connection's original end date.
const MAX_CONNECTED = plural(Math.round(OAUTH_TTL.GRANT_MAX / DAY), 'day');
// A connection nobody uses for this long has to be approved again.
const IDLE_LIMIT = plural(Math.round(OAUTH_TTL.REFRESH_TOKEN / DAY), 'day');
// Access an assistant already holds can't be cut short; it runs out on its own.
const AFTER_DISCONNECT = plural(Math.round(OAUTH_TTL.ACCESS_TOKEN / 60), 'minute');

export function ConnectAnAiAssistant() {
  return (
    <>
      <p>
        You can connect an AI assistant, like Claude or ChatGPT, to your {INSTANCE_NAME} account.
        Then you can ask it to make a signup for you, or to change one you already have.
      </p>
      <p>You see what it asks to do before you allow it, and you can disconnect it at any time.</p>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">What an assistant can do</h2>
        <p>
          A slot is one thing people can sign up for. A spot is one place in a slot. With the
          permissions you allow, an assistant can work on your signups the way you do:
        </p>
        <ul className="list-disc space-y-2 pl-6">
          <li>See your signups, their slots, and how many spots in each slot are taken.</li>
          <li>
            Make a new signup with all its slots. It starts as a draft, so nobody can sign up until
            it&apos;s published.
          </li>
          <li>
            Change a signup&apos;s title, description, closing time, reminder emails, fields and
            slots. A field is a detail every slot has, like its date.
          </li>
          <li>
            Publish, close, archive or delete a signup. Closing, archiving or deleting can&apos;t be
            undone.
          </li>
        </ul>
        <p>It can&apos;t see the names or email addresses of people who sign up.</p>
        <p>
          It acts as you, so it can&apos;t do anything you couldn&apos;t do yourself. What it reads
          from your signups goes to whoever runs the assistant, the same as anything you type to it.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">
          Add {INSTANCE_NAME} to your assistant
        </h2>
        <p>Your assistant needs this address:</p>
        <CopyText>{MCP_ADDRESS}</CopyText>
        <p>
          Assistants call what you&apos;re adding a connector, or an MCP server. MCP is a shared
          standard that lets AI assistants connect to other apps.
        </p>
        <p>
          The steps below happen in your assistant, not in {INSTANCE_NAME}, and its menus change
          from time to time. If a name doesn&apos;t match, look in its settings for connectors. You
          may need a computer: some assistants don&apos;t let you add a connector from their phone
          app.
        </p>
        <ul className="list-disc space-y-3 pl-6">
          <li>
            In Claude, go to Settings, then Connectors. Add a custom connector, and paste the
            address.
          </li>
          <li>
            In ChatGPT, turn on developer mode in its settings. Then add a connector, and paste the
            address.
          </li>
          <li className="space-y-3">
            <p>In Claude Code, run this command:</p>
            <CopyText>{`claude mcp add --transport http opensignup ${MCP_ADDRESS}`}</CopyText>
            <p>Then type /mcp in Claude Code, and choose opensignup to sign in.</p>
          </li>
          <li>In another assistant, look for a way to add a connector or an MCP server.</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Approve the connection</h2>
        <Steps>
          <Step>
            <p>
              When you add the connector, your assistant opens a {INSTANCE_NAME} page in your
              browser. If you aren&apos;t signed in, sign in first.
            </p>
            <p>
              If the page says <Ui>{UI.expired}</Ui>, go back to your assistant and start again.
            </p>
          </Step>
          <Step>
            <p>
              The page calls your assistant an app. It asks if you want to let a website, like
              claude.ai, use your account.
            </p>
            <p>
              {INSTANCE_NAME} gets the app&apos;s details from that website. The app picks its own
              name, so go by the website. Only allow it if you trust that website.
            </p>
            <p>
              If the people who run your site set the app up for you, the page says so instead of
              naming a website.
            </p>
          </Step>
          <Step>
            <p>
              Under <Ui>{UI.willBeAbleTo}</Ui>, read what your assistant is asking for. It can ask
              for:
            </p>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                <Ui>{UI.seeSignups}</Ui>, including how many spots are taken.
              </li>
              <li>
                <Ui>{UI.editSignups}</Ui>. This covers everything that changes a signup, including
                publishing and deleting it.
              </li>
              <li>
                <Ui>{UI.seePeople}</Ui>. Assistants aren&apos;t offered this, so most don&apos;t ask
                for it. If one does, the page shows it in amber with a warning. People gave these
                details to you, not to the assistant. Only allow it if you&apos;re happy for that
                website to have them.
              </li>
            </ul>
            <p>You allow everything on the list, or nothing.</p>
            <Screenshot
              src="/help/connect-an-ai-assistant/approve.png"
              alt="The approval page, listing what the app will be able to do, with Allow and Don't allow buttons below."
              width={704}
              height={277}
            />
          </Step>
          <Step>
            <p>
              Choose <Ui>{UI.allow}</Ui>. If you choose <Ui>{UI.dontAllow}</Ui> instead, nothing new
              is connected.
            </p>
          </Step>
          <Step>
            <p>Go back to your assistant. It can now work on your signups.</p>
          </Step>
        </Steps>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Try it</h2>
        <p>Ask for a signup in your own words. For example:</p>
        <blockquote className="border-l-4 border-surface-sunk pl-4 italic">
          Make a snack duty signup for six Saturday games, starting 3 October. Two families bring
          snacks to each game.
        </blockquote>
        <p>
          The assistant makes it as a draft. You&apos;ll find it on the <Ui>{UI.yourSignups}</Ui>{' '}
          page, marked draft. Check every slot there before you publish.
        </p>
        <p>
          Once it&apos;s published, anyone with the link can sign up. When it looks right, publish
          it yourself or ask the assistant to.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">How long a connection lasts</h2>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            A connection lasts up to {MAX_CONNECTED} from the first time you choose{' '}
            <Ui>{UI.allow}</Ui>. After that, you need to approve it again.
          </li>
          <li>
            If your assistant doesn&apos;t work on your signups for {IDLE_LIMIT}, you need to
            approve it again sooner.
          </li>
          <li>
            If you approve the same assistant again, it keeps the connection you have. It
            doesn&apos;t add a second one, or restart the {MAX_CONNECTED}.
          </li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Disconnect an assistant</h2>
        <p>
          Disconnecting stops an assistant from working on your signups. You can connect it again
          later.
        </p>
        <Steps>
          <Step>
            <p>
              Choose your email address at the top of any page in your account. On a phone, it says{' '}
              <Ui>{UI.settings}</Ui>.
            </p>
          </Step>
          <Step>
            <p>
              Choose <Ui>{UI.connectedApps}</Ui>. Each assistant shows its website, what you allowed
              it to do, and when it was last used.
            </p>
          </Step>
          <Step>
            <p>
              An assistant can keep working for up to {AFTER_DISCONNECT} after you disconnect it,
              and nobody can cut that short. Next to the assistant, choose <Ui>{UI.disconnect}</Ui>.
            </p>
          </Step>
        </Steps>
      </section>
    </>
  );
}
