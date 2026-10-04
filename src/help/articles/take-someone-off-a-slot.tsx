import { Screenshot, Step, Steps, Ui } from '../components';
import { UI } from './take-someone-off-a-slot.ui';

export { UI };

export function TakeSomeoneOffASlot() {
  return (
    <>
      <p>
        You can take one person off a slot, like someone who can&apos;t come and can&apos;t change
        it themselves. Their spot opens up for someone else, and everyone else stays signed up.
      </p>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Remove someone from a slot</h2>
        <p>
          The person doesn&apos;t get an email about it. You can&apos;t undo this, so check the name
          first.
        </p>
        <Steps>
          <Step>
            <p>
              Under your signup&apos;s title, choose the <Ui>{UI.responses}</Ui> tab. It lists
              everyone who has signed up.
            </p>
          </Step>
          <Step>
            <p>
              Find the person, and choose <Ui>{UI.remove}</Ui> at the end of their row. Only people
              who are still signed up have this button.
            </p>
          </Step>
          <Step>
            <p>
              You&apos;ll see a question naming them and their slot. Choose{' '}
              <Ui>{UI.yesRemove}</Ui>. To leave them on the slot, choose <Ui>{UI.keep}</Ui> instead.
            </p>
            <Screenshot
              src="/help/take-someone-off-a-slot/confirm.png"
              alt="The question Remove Sam Example from Fruit and water, with Keep and Yes, remove buttons under it."
              width={318}
              height={146}
            />
          </Step>
        </Steps>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">What happens next</h2>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            Their spot opens up, so someone else can sign up for it. If they took more than one
            spot, all of them open up.
          </li>
          <li>
            They stay on the <Ui>{UI.responses}</Ui> tab, marked <Ui>{UI.removed}</Ui>. The number
            on the tab no longer counts them.
          </li>
          <li>They get no email about it, and no reminder before the slot.</li>
          <li>
            If they open their link to change or cancel, it says <Ui>{UI.removedPage}</Ui>.
          </li>
        </ul>
      </section>
    </>
  );
}
