import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { clientId, config } = await request.json();

    const embedCode = `
<script>
  (function(w,d,s,o,f,js,fjs){
    w['HebrewChatWidget']=o;w[o]=w[o]||function(){
      (w[o].q=w[o].q||[]).push(arguments)};
    js=d.createElement(s),fjs=d.getElementsByTagName(s)[0];
    js.id=o;js.src=f;js.async=1;fjs.parentNode.insertBefore(js,fjs);
  }(window,document,'script','hcw','https://your-domain.com/widget.js'));
  
  hcw('init', {
    clientId: '${clientId}',
    theme: ${JSON.stringify(config.theme)},
    initialGreeting: '${config.initialGreeting}'
  });
</script>
    `.trim();

    return NextResponse.json({ embedCode });
  } catch (error) {
    console.error('Generate Embed Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate embed code' },
      { status: 500 }
    );
  }
} 