import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    // Get the authorization header
    const authorization = request.headers.get('authorization');
    
    if (!authorization) {
      return NextResponse.json({ error: 'Authorization header required' }, { status: 401 });
    }

    // Get the form data from the request
    const formData = await request.formData();
    
    // Forward the request to the media service
    const mediaServiceUrl = 'http://media-service.task-manager.svc.cluster.local:80/media/upload';
    
    // Create a timeout controller
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 600000); // 10 minutes
    
    try {
      const response = await fetch(mediaServiceUrl, {
        method: 'POST',
        headers: {
          'Authorization': authorization,
        },
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorData = await response.text();
        return new NextResponse(errorData, { status: response.status });
      }

      const responseData = await response.json();
      return NextResponse.json(responseData, { status: response.status });
      
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      
      if (fetchError.name === 'AbortError') {
        return NextResponse.json(
          { error: 'Upload timeout - file too large or network slow' }, 
          { status: 408 }
        );
      }
      
      throw fetchError;
    }
    
  } catch (error: any) {
    console.error('Upload proxy error:', error);
    
    return NextResponse.json(
      { error: 'Upload failed', details: error.message }, 
      { status: 500 }
    );
  }
}
