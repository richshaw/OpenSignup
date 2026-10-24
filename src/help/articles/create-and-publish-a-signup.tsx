import { REMINDER_SETTLE_HOURS, SLOT_CHANGE_SETTLE_MINUTES } from '@/lib/reminder-eligibility';
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

// How long after an organizer's last change a moved-slot email goes (src/jobs/slot-changes.ts).
const SETTLE_CHANGE = `${SLOT_CHANGE_SETTLE_MINUTES} minutes`;

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
              In <Ui>{UI.spots}</Ui>, type how many spots this slot has. If two families bring
              snacks to each game, type 2. Leave it blank for no limit.
            </p>
            <Screenshot
              src="/help/create-and-publish-a-signup/slot.png"
              alt="A slot being edited, with What set to Fruit and water, a date set, and Spots set to 2."
              width={520}
              height={219}
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
            People open the link and choose <Ui>{UI.signUp}</Ui> on a slot. They type their name
            and email address, and can add a note. You can make the email address optional, as
            shown below.
          </li>
          <li>
            A slot with more than one spot shows how many are left, like 1 left. People can take
            more than one spot at a time. When a slot is full, nobody else can choose it.
          </li>
          <li>
            Each person who gives an email address gets an email saying they&apos;re signed up. It
            has a link they can use to change or cancel. Everyone sees the link on screen after
            signing up, and people who gave no email address need to save it.
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
          If a slot has a date, people who take it and gave an email address get a reminder
          email{' '}
          {REMINDER_WHEN}. Someone who signs up later than that gets one about {SETTLE} after
          signing up, unless the slot is less than {SETTLE} away. Each reminder has a link to stop
          them.
        </p>
        <p>
          If you change the date or time of a slot people have taken, they get an email. It comes
          about {SETTLE_CHANGE} after your last change, with the new details. This goes with
          reminders: if you turn reminders off, nobody is told when you move a slot.
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

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">
          Let people sign up without an email
        </h2>
        <p>
          A signup asks people for their email address unless you make it optional. Someone who
          leaves it blank gets no emails at all, not even reminders. They need to save the link they see after
          signing up. Only the browser they used remembers it.
        </p>
        <p>To make the email address optional:</p>
        <Steps>
          <Step>
            <p>
              On a phone, the <Ui>{UI.settings}</Ui> link at the very top of the page is for your
              account, so skip it. Under your signup&apos;s title, choose the{' '}
              <Ui>{UI.settings}</Ui> tab.
            </p>
          </Step>
          <Step>
            <p>
              In <Ui>{UI.signupForm}</Ui>, under <Ui>{UI.askForEmail}</Ui>, choose{' '}
              <Ui>{UI.emailOptional}</Ui>. Once you save, the email box on your signup says{' '}
              <Ui>{UI.emailBoxOptional}</Ui>.
            </p>
          </Step>
          <Step>
            <p>
              Choose <Ui>{UI.save}</Ui>. You&apos;ll see <Ui>{UI.saved}</Ui>.
            </p>
            <Screenshot
              src="/help/create-and-publish-a-signup/email-setting.png"
              alt="The Sign-up form settings, with Optional chosen for Ask for an email address, and Saved next to the Save button."
              width={672}
              height={250}
            />
          </Step>
        </Steps>
        <p>
          If someone who left it blank loses their link, ask them to sign up again. If their slot is
          full, remove them on the <Ui>{UI.responses}</Ui> tab first, so there&apos;s room.
          Otherwise they show up there twice, and the old one is higher up the list. Remove that
          one.
        </p>
        <p>
          You can switch back to <Ui>{UI.emailRequired}</Ui> later. Only people who sign up after
          that are asked for an email address. Anyone who signed up without one keeps their spot.
        </p>
      </section>
    </>
  );
}
