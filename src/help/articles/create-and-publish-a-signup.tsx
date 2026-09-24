import { INSTANCE_NAME } from '@/lib/site-config';
import { REMINDER_LEAD_HOURS } from '@/schemas/signups';
import { Note, Screenshot, Step, Steps, Ui } from '../components';
import { UI } from './create-and-publish-a-signup.ui';

export { UI };

// Said the way the builder says it next to the date field.
const REMINDER_WHEN =
  REMINDER_LEAD_HOURS === 24 ? 'the day before' : `${REMINDER_LEAD_HOURS} hours before`;

export function CreateAndPublishASignup() {
  return (
    <>
      <p>
        A signup is a page where people choose something to do or bring. Each thing they can choose
        is a slot. When you finish this page, you&apos;ll have a signup with slots and a link to
        send to people.
      </p>
      <p>People who sign up don&apos;t need an account. All they need is the link.</p>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Make the signup</h2>
        <Steps>
          <Step>
            <p>
              Sign in to {INSTANCE_NAME}. On <Ui>{UI.yourSignups}</Ui>, choose{' '}
              <Ui>{UI.newSignup}</Ui> at the top of the page.
            </p>
            <Note>
              <p>
                Some sites can write a first draft for you. If you see <Ui>{UI.composeHeading}</Ui>,
                you can describe your signup in a few sentences and choose{' '}
                <Ui>{UI.draftCompose}</Ui>. Check the draft before you publish it.
              </p>
              <p>
                To follow the steps on this page instead, choose <Ui>{UI.skipCompose}</Ui>.
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
              alt="The New signup form, with Snack duty — Spring season typed in as the title."
              width={576}
              height={356}
            />
          </Step>
          <Step>
            <p>
              Choose <Ui>{UI.createSignup}</Ui>. Your signup is saved as a draft. Nobody else can
              see it yet.
            </p>
          </Step>
        </Steps>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Add slots</h2>
        <p>
          A slot is one thing people can sign up for, like snacks for one game. A new signup starts
          with one empty slot.
        </p>
        <Steps>
          <Step>
            <p>
              Choose the empty slot. It says <Ui>{UI.emptySlot}</Ui>.
            </p>
          </Step>
          <Step>
            <p>
              Fill in <Ui>{UI.what}</Ui>, like &ldquo;Fruit and water&rdquo;, and choose a{' '}
              <Ui>{UI.date}</Ui>.
            </p>
          </Step>
          <Step>
            <p>
              In <Ui>{UI.capacity}</Ui>, put how many people can take this slot. For two families
              per game, put 2.
            </p>
            <Screenshot
              src="/help/create-and-publish-a-signup/slot.png"
              alt="An open slot with What set to Fruit and water, a date chosen, and Capacity set to 2."
              width={520}
              height={182}
            />
          </Step>
          <Step>
            <p>
              Choose <Ui>{UI.done}</Ui>. Your changes save as you go.
            </p>
          </Step>
          <Step>
            <p>
              For the next slot, choose <Ui>{UI.addSlot}</Ui> and fill it in the same way. To copy a
              slot and change only the date, open it and choose <Ui>{UI.duplicate}</Ui>.
            </p>
          </Step>
          <Step>
            <p>
              If you have a slot you don&apos;t need, open it and choose <Ui>{UI.delete}</Ui>.
              People would see an empty slot as <Ui>{UI.untitledSlot}</Ui>.
            </p>
          </Step>
        </Steps>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Publish and share it</h2>
        <Steps>
          <Step>
            <p>
              To check your signup first, choose <Ui>{UI.preview}</Ui> at the top of the page. It
              opens in a new tab and shows the signup the way people will see it. Phones don&apos;t
              show this button.
            </p>
          </Step>
          <Step>
            <p>
              Choose <Ui>{UI.publish}</Ui> at the top of the page. On a phone, tap the three dots at
              the top, then <Ui>{UI.publishOnPhone}</Ui>.
            </p>
            <p>
              You&apos;ll see <Ui>{UI.published}</Ui>. From now on, anyone with the link can sign
              up.
            </p>
          </Step>
          <Step>
            <p>
              Next to <Ui>{UI.publicLink}</Ui>, choose the copy button. Send the link to people by
              email or in a group chat.
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
            People open the link, choose a slot, and type their name and email. Each slot shows how
            many people have taken it, like 1/2.
          </li>
          <li>
            Each person gets an email saying they&apos;re signed up. It has a link they can use to
            change or cancel.
          </li>
          <li>People who take a slot with a date get a reminder email {REMINDER_WHEN}.</li>
          <li>
            Search engines don&apos;t list signup pages. Only people you send the link to will find
            it.
          </li>
        </ul>
      </section>
    </>
  );
}
