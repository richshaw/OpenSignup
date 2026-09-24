import { REMINDER_SETTLE_HOURS } from '@/lib/reminder-eligibility';
import { INSTANCE_NAME } from '@/lib/site-config';
import { REMINDER_LEAD_HOURS } from '@/schemas/signups';
import { Note, Screenshot, Step, Steps, Ui } from '../components';
import { UI } from './create-and-publish-a-signup.ui';

export { UI };

// Said the way the builder says it next to the date field.
const REMINDER_WHEN =
  REMINDER_LEAD_HOURS === 24 ? 'the day before' : `${REMINDER_LEAD_HOURS} hours before`;
// A sign-up newer than this isn't picked up yet (src/jobs/reminders.ts).
const SETTLE = REMINDER_SETTLE_HOURS === 1 ? 'an hour' : `${REMINDER_SETTLE_HOURS} hours`;

export function CreateAndPublishASignup() {
  return (
    <>
      <p>
        A signup is a page where people choose something to do or bring. Each thing they can choose
        is a slot. By the end, you&apos;ll have a published signup and a link to send to people.
      </p>
      <p>People who sign up don&apos;t need an account. All they need is the link.</p>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Create the signup</h2>
        <Steps>
          <Step>
            <p>
              Sign in to {INSTANCE_NAME}. The first time you sign in, this creates your account.
            </p>
          </Step>
          <Step>
            <p>
              On the <Ui>{UI.yourSignups}</Ui> page, choose <Ui>{UI.newSignup}</Ui> at the top.
            </p>
            <Note>
              <p>
                Some sites can fill in a signup for you. If you see <Ui>{UI.composeHeading}</Ui>,
                describe your signup in a few sentences. Then choose <Ui>{UI.draftCompose}</Ui>, and
                check every slot before you publish.
              </p>
              <p>
                To follow the steps here instead, choose <Ui>{UI.skipCompose}</Ui>.
              </p>
            </Note>
          </Step>
          <Step>
            <p>
              Type a name in <Ui>{UI.title}</Ui>, like &ldquo;Snack duty &mdash; Spring
              season&rdquo;. You can add a few lines about it in <Ui>{UI.description}</Ui>.
            </p>
            <Screenshot
              src="/help/create-and-publish-a-signup/new-signup.png"
              alt="The New signup page, with Snack duty — Spring season typed in as the title."
              width={576}
              height={356}
            />
          </Step>
          <Step>
            <p>
              Choose <Ui>{UI.createSignup}</Ui>. Your signup is saved as a draft. Nobody else can
              see a draft until you publish it.
            </p>
          </Step>
        </Steps>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Add slots</h2>
        <p>
          A slot is one thing people can sign up for, like snacks for one game. Each slot has one or
          more spots. A person can take one spot or several. A new signup starts with one empty
          slot.
        </p>
        <Steps>
          <Step>
            <p>
              Choose the slot marked <Ui>{UI.emptySlot}</Ui> to open it.
            </p>
          </Step>
          <Step>
            <p>
              In <Ui>{UI.what}</Ui>, type what the slot is for, like &ldquo;Fruit and water&rdquo;.
            </p>
          </Step>
          <Step>
            <p>
              Set the <Ui>{UI.date}</Ui>.
            </p>
          </Step>
          <Step>
            <p>
              In <Ui>{UI.capacity}</Ui>, type how many spots this slot has. If two families bring
              snacks to each game, type 2.
            </p>
            <Screenshot
              src="/help/create-and-publish-a-signup/slot.png"
              alt="A slot being edited, with What set to Fruit and water, a date set, and Capacity set to 2."
              width={520}
              height={182}
            />
          </Step>
          <Step>
            <p>
              Choose <Ui>{UI.done}</Ui> to close the slot. Your changes save as you go.
            </p>
          </Step>
          <Step>
            <p>
              For the next slot, choose <Ui>{UI.addSlot}</Ui> and fill it in the same way.
            </p>
          </Step>
          <Step>
            <p>
              To copy a slot, open it and choose <Ui>{UI.duplicate}</Ui>. Then open the copy and
              change its date.
            </p>
          </Step>
        </Steps>
        <p>
          You can&apos;t undo deleting a slot. To remove one you don&apos;t need, open it and choose{' '}
          <Ui>{UI.delete}</Ui>. Don&apos;t leave a slot empty: people see it as{' '}
          <Ui>{UI.untitledSlot}</Ui>.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Publish and share the link</h2>
        <Steps>
          <Step>
            <p>
              On a computer, you can check your signup first. Choose <Ui>{UI.preview}</Ui> at the
              top of the page. It opens in a new tab and shows what people will see. Small screens,
              like most phones, don&apos;t show this button.
            </p>
          </Step>
          <Step>
            <p>
              When you publish, anyone with the link can sign up. Choose <Ui>{UI.publish}</Ui> at
              the top of the page. On a phone, choose the three dots at the top, then{' '}
              <Ui>{UI.publishOnPhone}</Ui>.
            </p>
            <p>
              You&apos;ll see <Ui>{UI.published}</Ui>.
            </p>
          </Step>
          <Step>
            <p>
              Next to <Ui>{UI.publicLink}</Ui>, choose the copy button. Send the link to people by
              email or in a group chat.
            </p>
            <p>
              The link is there before you publish too. Until you publish, it only says the signup
              isn&apos;t ready.
            </p>
            <Screenshot
              src="/help/create-and-publish-a-signup/published.png"
              alt="The top of a published signup, marked open, with the public link and its copy button."
              width={480}
              height={110}
            />
          </Step>
        </Steps>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">What happens next</h2>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            People open the link and choose <Ui>{UI.signUp}</Ui> on a slot. They type their name and
            email, and can add a note.
          </li>
          <li>
            A slot with more than one spot shows how many are taken, like 1/2. People can take more
            than one spot at a time. When a slot is full, nobody else can choose it.
          </li>
          <li>
            Each person gets an email saying they&apos;re signed up. It has a link they can use to
            change or cancel.
          </li>
          <li>
            Search engines are asked not to list signup pages. Anyone with the link can open yours,
            so share it only with the people you want.
          </li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Reminders</h2>
        <p>
          If a slot has a date, people who take it get a reminder email {REMINDER_WHEN}. Someone who
          signs up later than that gets one about {SETTLE} after signing up, unless the slot is less
          than {SETTLE} away. Each reminder has a link to stop them.
        </p>
        <p>Reminders are on for every new signup. To turn them off:</p>
        <Steps>
          <Step>
            <p>
              Choose <Ui>{UI.fields}</Ui> at the top of your signup.
            </p>
          </Step>
          <Step>
            <p>
              Choose <Ui>{UI.date}</Ui>.
            </p>
          </Step>
          <Step>
            <p>
              Clear <Ui>{UI.reminderToggle}</Ui>, then choose <Ui>{UI.save}</Ui>.
            </p>
          </Step>
        </Steps>
      </section>
    </>
  );
}
