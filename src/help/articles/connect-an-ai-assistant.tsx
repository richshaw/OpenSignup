import { APP_ORIGIN, INSTANCE_NAME } from '@/lib/site-config';
import { MCP_RESOURCE_PATH, OAUTH_TTL } from '@/oauth/config';
import { CopyText, Screenshot, Step, Steps, Ui } from '../components';
import { UI } from './connect-an-ai-assistant.ui';

export { UI };

// Every site has its own address, so this is built, never typed.
const MCP_ADDRESS = `${APP_ORIGIN}${MCP_RESOURCE_PATH}`;

const DAY = 24 * 60 * 60;
const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;
// The longest a connection lasts from the last time you choose Allow.
const MAX_CONNECTED = plural(Math.round(OAUTH_TTL.GRANT_MAX / DAY), 'day');
// A connection nobody uses for this long has to be approved again.
const IDLE_LIMIT = plural(Math.round(OAUTH_TTL.REFRESH_TOKEN / DAY), 'day');
// Access an app already holds can't be cut short; it runs out on its own.
const AFTER_DISCONNECT = plural(Math.round(OAUTH_TTL.ACCESS_TOKEN / 60), 'minute');

export function ConnectAnAiAssistant() {
  return (
    <>
      <p>
        You can connect an AI assistant, like Claude or ChatGPT, to your {INSTANCE_NAME} account.
        Then you can ask it to make a signup for you, or to change one you already have.
      </p>
      <p>You choose what it&apos;s allowed to do, and you can disconnect it at any time.</p>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">What an assistant can do</h2>
        <p>Once it&apos;s connected, an assistant can work on your signups the way you do:</p>
        <ul className="list-disc space-y-2 pl-6">
          <li>See your signups, their slots, and how many spots in each slot are taken.</li>
          <li>
            Make a new signup with all its slots. It starts as a draft, so nobody can sign up until
            you publish it.
          </li>
          <li>
            Change a signup&apos;s title, description, closing time, settings, fields and slots. A
            field is a detail every slot has, like its date.
          </li>
          <li>Publish, close, archive or delete a signup.</li>
        </ul>
        <p>It can&apos;t see the names or email addresses of people who sign up.</p>
        <p>
          It acts as you, so it can&apos;t do anything you couldn&apos;t do yourself. What it reads
          from your signups goes to the company that makes the assistant, the same as anything you
          type to it.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Add {INSTANCE_NAME} to your assistant</h2>
        <p>Your assistant needs this address:</p>
        <CopyText>{MCP_ADDRESS}</CopyText>
        <p>
          Assistants call this a connector, or an MCP server. MCP is a shared standard that lets AI
          assistants connect to other apps.
        </p>
        <ul className="list-disc space-y-3 pl-6">
          <li>
            In the Claude app, open Settings, then Connectors. Choose to add a custom connector, and
            paste the address.
          </li>
          <li>
            In ChatGPT, turn on developer mode in its settings. Then add a connector and paste the
            address.
          </li>
          <li className="space-y-3">
            <p>In Claude Code, run this command:</p>
            <CopyText>{`claude mcp add --transport http opensignup ${MCP_ADDRESS}`}</CopyText>
            <p>Then type /mcp in Claude Code and choose opensignup to sign in.</p>
          </li>
          <li>In another assistant, look for a way to add a connector or an MCP server.</li>
        </ul>
        <p>
          These menus belong to each assistant, not to {INSTANCE_NAME}, and they change from time to
          time. If a name doesn&apos;t match, look in the assistant&apos;s settings for connectors.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Approve the connection</h2>
        <Steps>
          <Step>
            <p>
              Your assistant opens a {INSTANCE_NAME} page in your browser. If you aren&apos;t signed
              in, sign in first.
            </p>
          </Step>
          <Step>
            <p>
              The page asks if you want to let a website, like claude.ai, use your account.{' '}
              {INSTANCE_NAME} checks that the app comes from that website. The app picks its own
              name, so go by the website. Only allow it if you trust that website.
            </p>
            <p>
              If the people who run your site set the app up for you, the page says so instead of
              naming a website.
            </p>
          </Step>
          <Step>
            <p>
              Under <Ui>{UI.willBeAbleTo}</Ui>, read what the app is asking for. It can ask for:
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
                <Ui>{UI.seePeople}</Ui>. An app only gets this if it asks for it on its own, and the
                page shows it in amber with a warning. People gave these details to you, not to the
                app. Only allow it if you&apos;re happy for that website to have them.
              </li>
            </ul>
            <Screenshot
              src="/help/connect-an-ai-assistant/approve.png"
              alt="The approval page, listing what the app will be able to do, with Allow and Don't allow buttons below."
              width={704}
              height={277}
            />
          </Step>
          <Step>
            <p>
              Choose <Ui>{UI.allow}</Ui>. If you choose <Ui>{UI.dontAllow}</Ui> instead, nothing is
              connected.
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
          The assistant makes it as a draft. You&apos;ll find it on your <Ui>{UI.yourSignups}</Ui>{' '}
          page, where you can check every slot before you publish. When it looks right, publish it
          yourself or ask the assistant to.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">How long it stays connected</h2>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            A connection lasts up to {MAX_CONNECTED} from when you choose <Ui>{UI.allow}</Ui>. After
            that, you need to approve it again.
          </li>
          <li>If you don&apos;t use it for {IDLE_LIMIT}, you need to approve it again sooner.</li>
          <li>
            If you approve the same assistant again, it renews the connection you have. It
            doesn&apos;t add a second one.
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
              When you&apos;re signed in, choose your email address at the top of the page. On a
              phone, it says <Ui>{UI.settings}</Ui>.
            </p>
          </Step>
          <Step>
            <p>
              Choose <Ui>{UI.connectedApps}</Ui>. Each app shows its website, what you allowed it to
              do, and when it was last used.
            </p>
          </Step>
          <Step>
            <p>
              An app can keep working for up to {AFTER_DISCONNECT} after you disconnect it. This
              can&apos;t be cut short. Next to the app, choose <Ui>{UI.disconnect}</Ui>.
            </p>
          </Step>
        </Steps>
      </section>
    </>
  );
}
