declare module '*?worker' {
  const WorkerFactory: new (options?: WorkerOptions) => Worker;
  export default WorkerFactory;
}
declare module '*?worker&inline' {
  const WorkerFactory: new (options?: WorkerOptions) => Worker;
  export default WorkerFactory;
}
