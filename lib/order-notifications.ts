export async function transitionAndEnqueueNotification(
  transition: () => Promise<boolean>,
  enqueue: () => Promise<void>,
) {
  if (!(await transition())) return false;
  await enqueue();
  return true;
}
